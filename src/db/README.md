# Prisma Database Setup

This document describes the Prisma database setup for storing search results in the Farseer application.

## Overview

The application uses Prisma with SQLite to replace file-based search result caching. Search results are now stored in a relational database with proper indexing for efficient querying.

## Database Schema

### SearchCache Table
Stores unique search parameter combinations and serves as the parent for hotel results.

**Fields:**
- `id` - Unique identifier (CUID)
- `cacheKey` - Unique sanitized search parameters (e.g., `ATL_LAS_2026-01-10_2026-01-17_1_2`)
- `origin` - Origin location code
- `destination` - Destination location code
- `checkIn` - Check-in date
- `checkOut` - Check-out date
- `rooms` - Number of rooms
- `adultsPerRoom` - JSON string: `[2,2]`
- `childrenPerRoom` - JSON string: `[0,0]`
- `childAges` - JSON string: `[[],[]]`
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp

**Indexes:**
- Unique index on `cacheKey`
- Composite index on `origin`, `destination`, `checkIn`

### Hotel Table
Stores individual hotel results linked to search queries.

**Fields:**
- `id` - Unique identifier (CUID)
- `hotelId` - Hotel identifier from VAX
- `name` - Hotel name
- `vendor` - Vendor code (e.g., "FJ1")
- `remoteSource` - Source code (e.g., "HBSHotel")
- `destinationCode` - Destination code
- `rating` - Hotel star rating (1-5)
- `tripAdvisorRating` - TripAdvisor rating (optional)
- `tripAdvisorReviews` - Number of reviews (optional)
- `location` - Location description
- `distanceFromAirport` - Distance in miles (optional)
- `cleaningBadge` - Cleaning/safety badge (optional)
- `checkIn` - Check-in date (denormalized)
- `checkOut` - Check-out date (denormalized)
- `searchCacheId` - Foreign key to SearchCache
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp

**Indexes:**
- Composite index on `hotelId`, `vendor`
- Index on `searchCacheId`
- Index on `rating`
- Index on `name`

**Relations:**
- Belongs to one `SearchCache` (cascade delete)
- Has many `Room` entries

### Room Table
Stores individual room options for each hotel.

**Fields:**
- `id` - Unique identifier (CUID)
- `code` - Room type code
- `name` - Room description (e.g., "Bleau King")
- `totalPrice` - Total price for the stay
- `pricePerPerson` - Price per person (optional)
- `addedValues` - JSON string array: `["$150 Food & Beverage credit"]`
- `valueIndicators` - JSON string array: `["Upgrade Bonus $ Available"]`
- `hotelId` - Foreign key to Hotel
- `createdAt` - Creation timestamp
- `updatedAt` - Last update timestamp

**Indexes:**
- Index on `hotelId`
- Index on `totalPrice`

**Relations:**
- Belongs to one `Hotel` (cascade delete)

## Commands

### Generate Prisma Client
```bash
bunx prisma generate
```

### Create Migration
```bash
bunx prisma migrate dev --name migration_name
```

### Apply Migrations
```bash
bunx prisma migrate deploy
```

### Reset Database
```bash
bunx prisma migrate reset
```

### Open Prisma Studio (GUI)
```bash
bunx prisma studio
```

## Usage in Code

### Database Client
The Prisma client is initialized as a singleton in [src/lib/db.ts](../src/lib/db.ts):

```typescript
import { prisma } from "../lib/db.js";

// Use prisma client
const hotels = await prisma.hotel.findMany();
```

### Search Cache Helpers
Helper functions are available in [src/lib/searchCache.ts](../src/lib/searchCache.ts):

```typescript
import { getCachedSearchResults, saveSearchResultsToCache } from "../lib/searchCache.js";

// Check cache
const cached = await getCachedSearchResults(params);

// Save to cache
await saveSearchResultsToCache(params, hotels);
```

## Cache Management

### Automatic Cleanup
Old cache entries can be cleaned up using the `clearOldCacheEntries` function:

```typescript
import { clearOldCacheEntries } from "../lib/searchCache.js";

// Clear entries older than 7 days
const count = await clearOldCacheEntries(7);
```

### Manual Cleanup
You can also manually delete cache entries using Prisma:

```typescript
import { prisma } from "../lib/db.js";

// Delete by cache key
await prisma.searchCache.delete({
  where: { cacheKey: "ATL_LAS_2026-01-10_2026-01-17_1_2" }
});

// Delete all cache entries
await prisma.searchCache.deleteMany();
```

## Migration from File Storage

The previous file-based cache (`src/clients/vax/search_*.json`) has been replaced with database storage. The old file-based methods have been removed from VaxClient:

**Removed methods:**
- `generateSearchCacheKey()` - now in `searchCache.ts`
- `getCachedSearchResults()` - replaced with database version
- `saveSearchResultsToCache()` - replaced with database version

**Migration steps:**
1. Old file-based cache files are gitignored and can be safely deleted
2. The database will be populated automatically as new searches are performed
3. No manual data migration is needed

## Performance Considerations

1. **Indexes**: The schema includes indexes on frequently queried fields (rating, price, hotel name)
2. **Cascade Deletes**: Deleting a SearchCache entry automatically removes all related hotels and rooms
3. **JSON Fields**: Arrays are stored as JSON strings to maintain compatibility with SQLite
4. **Denormalization**: Check-in/out dates are stored in both SearchCache and Hotel for faster querying

## Database File Location

The SQLite database file is located at:
```
./dev.db
```

This file is gitignored and contains all cached search results.
