# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Farseer is a travel deals aggregator that collects vacation packages from third-party suppliers and displays them with markup. The application uses both API-based integration and web scraping to gather data from multiple travel vendors.

## Technology Stack

- **Runtime**: Bun (with fallback Node.js support via pnpm)
- **Language**: TypeScript with strict mode
- **Database**: Prisma 7 with SQLite (via libSQL adapter)
- **Frontend**: React 19 with server-side rendering (react-dom/server)
- **Backend**: Bun.serve with file-based routing
- **HTTP Client**: axios with custom cookie management
- **Browser Automation**: Playwright for headless scraping
- **Validation**: Zod for environment variable schemas
- **State Management**: TanStack Query (React Query)


## Architecture Overview

### Server-Side Rendering (SSR)

The application uses Bun.serve with React SSR:
- **Entry**: [src/server.tsx](src/server.tsx)
- **Routes**: Defined in `Bun.serve({ routes: {...} })`
  - `/*` → serves [src/index.html](src/index.html)
  - `/api/vendors` → returns cached vendor list
  - `/api/origins` → returns origin markets by vendor
  - `/api/destinations` → returns destination markets by vendor/origin
  - `/results` → SSR hotel search results with filters/sorting

### Frontend Architecture

- **Client Entry**: [src/frontend.tsx](src/frontend.tsx) hydrates the React app
- **Main Component**: [src/App.tsx](src/App.tsx)
- **Search Form**: [src/components/SearchForm.tsx](src/components/SearchForm.tsx) uses TanStack Query
- **Results Display**: [src/components/HotelResults.tsx](src/components/HotelResults.tsx) server-rendered

CSS is regular CSS (not CSS modules) due to Bun serve limitations. All component-specific styles use prefixed class names (e.g., `search-form-*`).

### Database Architecture

The application uses **Prisma 7 with SQLite** for search result caching:

**Database Client:**
- Location: [src/lib/db.ts](src/lib/db.ts)
- Uses Prisma libSQL adapter for SQLite compatibility
- Singleton pattern prevents multiple connections
- Development logging enabled for query debugging

**Schema:** (see [prisma/schema.prisma](prisma/schema.prisma))
- `SearchCache` - Unique search parameter combinations with indexed cache keys
- `Hotel` - Hotel results with ratings, location, vendor (cascade delete from SearchCache)
- `Room` - Room options with pricing (cascade delete from Hotel)

**Search Cache Helpers:** [src/lib/searchCache.ts](src/lib/searchCache.ts)
```typescript
import { getCachedSearchResults, saveSearchResultsToCache } from './lib/searchCache.js';

// Check database cache
const cached = await getCachedSearchResults(params);

// Save to database
await saveSearchResultsToCache(params, hotels);
```

**Key Features:**
- Indexed queries on rating, price, hotel name
- JSON fields for arrays (SQLite compatible)
- Automatic cleanup utility: `clearOldCacheEntries(days)`
- Database file: `dev.db` (gitignored)

See [prisma/README.md](prisma/README.md) for complete database documentation.

### Configuration System

**CRITICAL**: Never access `process.env` directly. Always use the validated config object.

```typescript
import { config } from './config/env.js';

// Access validated configuration
config.vax.username
config.pricing.markupPercentage
config.playwright.headless
```

Configuration is validated at startup using Zod schemas in [src/config/env.ts](src/config/env.ts). The app will fail fast with detailed error messages if environment variables are invalid or missing.

To add new environment variables:
1. Update the Zod schema in [src/config/env.ts](src/config/env.ts)
2. Add to the `config` export object
3. Document in `.env` (not committed)
4. See [src/config/README.md](src/config/README.md) for detailed examples

### VAX Client Architecture

The core travel supplier is VAX Vacation Access ([src/clients/vax/vax.client.ts](src/clients/vax/vax.client.ts)):

**Authentication Flow:**
1. Login requires ASP.NET form data extraction (ViewState, EventValidation)
2. After login POST, must follow redirect to `new.www.vaxvacationaccess.com` to establish session cookies across domains
3. Session cookies are managed via custom `CookieJar` class in [src/clients/baseClient.ts](src/clients/baseClient.ts)
4. Sessions are cached to `.sessions/` directory (gitignored) with TTL-based expiration

**Search Results Caching:**
- Search results are cached in SQLite database via Prisma
- Cache key format: `{origin}_{destination}_{checkIn}_{checkOut}_{rooms}_{adults}[-children][-childAges]`
- Database stores SearchCache entries with related Hotel and Room records
- `searchAllVendors()` aggregates results from all vendors and caches to database

**Market Data:**
- Vendors cached in `src/clients/vax/vendors.json`
- Origins cached in `src/clients/vax/origin-markets.json` (keyed by vendor code)
- Destinations cached in `src/clients/vax/destination-markets.json` (keyed by vendor code)

**ASP.NET Quirks:**
- VAX uses ASP.NET WebForms with AJAX endpoints returning JSON wrapped in `{ d: [...] }`
- Query parameters must be manually built using URLSearchParams
- Optional parameters must use string literal `"null"` instead of JavaScript `null`
- All AJAX requests require headers: `X-Requested-With: XMLHttpRequest`, `sec-fetch-*` headers

### Base HTTP Client

[src/clients/baseClient.ts](src/clients/baseClient.ts) provides:
- `createBaseClient()`: axios instance with realistic browser headers
- `CookieJar`: Manual cookie management for cross-domain sessions
- Request/response interceptors for logging and timing

All API clients should extend this base client for consistency.

### Debugging Tools

**Response Storage** ([src/utils/responseStorage.ts](src/utils/responseStorage.ts)):
```typescript
const client = new VaxClient({ enableDebugStorage: true });
// Saves all HTTP responses to .responses/*.html with timestamps
```

**Playwright Debugger** ([src/debug/vaxPlaywrightDebug.ts](src/debug/vaxPlaywrightDebug.ts)):
- Launches visible browser through VAX login/search flow
- Takes screenshots at each step
- Saves HTML snapshots
- Captures network requests
- Compares browser behavior with axios implementation

See [src/debug/README_VAX_DEBUG.md](src/debug/README_VAX_DEBUG.md) for details.

### Session Storage

Sessions are cached to avoid repeated logins:
- Location: `.sessions/vax_{username}_{arc}.json`
- Contains: cookies, arcNumber, username, loginTime
- TTL: Configurable via `config.session.ttlHours`
- Auto-restore on client initialization

See [src/utils/README.md](src/utils/README.md) for session storage details.

## Data Models

TypeScript interfaces are defined in [src/clients/vax/vax.models.ts](src/clients/vax/vax.models.ts):
- `VaxLoginCredentials`, `VaxLoginFormData`, `VaxLoginResponse`
- `VaxSession` - session cookies and metadata
- `VaxSearchParams` - search parameters (vendor, packageType, origin, destination, dates, rooms, guests)
- `VaxHotelResult` - hotel with rooms, ratings, location, vendor
- `VaxRoomOption` - room type, price, added values, value indicators
- `VaxVendor`, `VaxMarket`

**Important**: The `VaxSearchParams` for `searchAllVendors()` uses `Omit<VaxSearchParams, "vendor" | "packageType">` since it searches across all vendors.

## Custom Skills

Located in `.claude/skills/`:

**api-builder**: Converts cURL commands to TypeScript axios functions
```
Usage: Provide cURL examples → generates typed client with interfaces
Output: TypeScript function in src/clients/ with request/response types
```

See [.claude/skills/api-builder/SKILL.md](.claude/skills/api-builder/SKILL.md) for details.

## TypeScript Configuration

Strict mode enabled with additional checks:
- `noUncheckedIndexedAccess`: Always check array/object access safety
- `exactOptionalPropertyTypes`: Strict optional property handling
- `verbatimModuleSyntax`: Explicit import/export syntax required
- `noUnusedLocals`, `noUnusedParameters`: No dead code

Module system: `NodeNext` for modern Node.js/Bun compatibility with `.js` extensions in imports.

## File Structure Conventions

```
src/
├── clients/          # API client wrappers
│   ├── baseClient.ts        # Shared axios client + CookieJar
│   └── vax/
│       ├── vax.client.ts    # VAX API client
│       ├── vax.models.ts    # TypeScript interfaces
│       ├── vax.example.ts   # Usage examples
│       ├── vendors.json     # Cached vendor list
│       ├── origin-markets.json
│       ├── destination-markets.json
│       └── search_*.json    # Cached search results (gitignored)
├── components/       # React components
│   ├── SearchForm.tsx       # Main search form with TanStack Query
│   ├── SearchForm.css       # Component styles (prefixed classes)
│   └── HotelResults.tsx     # SSR results display
├── config/           # Environment configuration
│   ├── env.ts               # Zod schema + validated config export
│   └── README.md            # Config system documentation
├── lib/              # Core libraries
│   ├── db.ts                # Prisma client singleton (libSQL adapter)
│   └── searchCache.ts       # Database search cache helpers
├── debug/            # Debugging utilities
│   ├── vaxPlaywrightDebug.ts
│   └── README_VAX_DEBUG.md
├── utils/            # Shared utilities
│   ├── sessionStorage.ts    # Session caching system
│   ├── responseStorage.ts   # Debug response storage
│   ├── aspnet-form.utils.ts # ASP.NET form parsing
│   └── README*.md           # Utility documentation
├── App.tsx           # Main React app component
├── frontend.tsx      # Client-side hydration entry
├── server.tsx        # Bun.serve SSR server
└── index.html        # HTML template
```

## Git Ignored Files

Important gitignore patterns:
- `.env` - contains secrets
- `.sessions/` - cached VAX sessions
- `.responses/` - debug response storage
- `*.db`, `*.db-journal` - SQLite database files
- `prisma/migrations/` - Prisma migration history
- `dist/` - build output

## Important Patterns

**Cross-Domain Authentication:**
After VAX login, always follow the redirect to establish cookies on the search domain:
```typescript
const redirectResponse = await this.client.get(redirectUrl, {
  headers: { Cookie: this.cookieJar.getCookieHeader() }
});
this.cookieJar.setCookiesFromResponse(redirectResponse);
```

**ASP.NET Parameter Encoding:**
Build query strings manually, use string `"null"` for null values:
```typescript
const params = new URLSearchParams();
params.append("regionCode", regionCode ? `"${regionCode}"` : "null");
const url = `${endpoint}?${params.toString()}`;
```

**Search Result Caching (Database):**
Always check database cache before live search, save after aggregating results:
```typescript
import { getCachedSearchResults, saveSearchResultsToCache } from './lib/searchCache.js';

// Check cache
const cached = await getCachedSearchResults(params);
if (cached) return { success: true, hotels: cached };

// Perform search...

// Save to database
await saveSearchResultsToCache(params, results);
```

## Bun-Specific Considerations

- Use `Bun.file()` for file operations instead of `fs.readFile`
- CSS modules not supported with `bun serve` - use regular CSS
- `bun --hot` provides HMR without additional config
- Built-in support for TypeScript, React JSX/TSX
- Fast package installation with Bun-native performance
