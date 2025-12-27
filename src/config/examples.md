# Configuration Examples

## Example 1: Valid Configuration

When all required environment variables are set correctly:

```bash
# .env
NODE_ENV=development
VAX_ARC=10548020
VAX_USERNAME=testuser
VAX_PASSWORD=testpass123
MARKUP_PERCENTAGE=15
```

**Output:**
```
✓ Environment configuration loaded successfully
  Environment: development
  Port: 3000
  Markup: 15%
```

## Example 2: Missing Required Variable

If a required variable is missing:

```bash
# .env - Missing VAX_USERNAME
NODE_ENV=development
VAX_ARC=10548020
VAX_PASSWORD=testpass123
```

**Output:**
```
❌ Environment validation failed:

  VAX_USERNAME:
    - VAX_USERNAME is required

Please check your .env file and ensure all required variables are set.
See .env.example for reference.

[Process exits with error]
```

## Example 3: Invalid Value Range

If a value is out of valid range:

```bash
# .env - Invalid markup percentage
MARKUP_PERCENTAGE=150
```

**Output:**
```
❌ Environment validation failed:

  MARKUP_PERCENTAGE:
    - Number must be less than or equal to 100

Please check your .env file and ensure all required variables are set.
See .env.example for reference.

[Process exits with error]
```

## Example 4: Using Config in Code

### Accessing Configuration

```typescript
import { config, isDevelopment } from './config/env.js';

// Access nested config values
const username = config.vax.username;
const markup = config.pricing.markupPercentage;
const headless = config.playwright.headless;

// Use environment helpers
if (isDevelopment) {
  console.log('Running in dev mode');
}
```

### Type Safety

```typescript
import { config } from './config/env.js';

// TypeScript knows the exact types
const port: number = config.app.port;
const headless: boolean = config.playwright.headless;
const logLevel: "debug" | "info" | "warn" | "error" = config.app.logLevel;

// This would be a TypeScript error:
// const invalid: string = config.app.port; // Error: Type 'number' is not assignable to type 'string'
```

### API Client Example

```typescript
import { config } from '../config/env.js';
import { createVaxClient } from '../clients/vaxClient.js';

async function loginToVax() {
  const vaxClient = createVaxClient();

  // Use validated credentials from config
  const response = await vaxClient.login({
    arc: config.vax.arc,
    username: config.vax.username,
    password: config.vax.password
  });

  return response;
}
```

## Example 5: Adding a New API Integration

Let's say you want to add a new travel API. Here's the complete flow:

### Step 1: Update Zod Schema

```typescript
// src/config/env.ts
const envSchema = z.object({
  // ... existing variables

  // New API credentials
  EXPEDIA_API_KEY: z.string().min(1, 'EXPEDIA_API_KEY is required'),
  EXPEDIA_API_SECRET: z.string().min(1, 'EXPEDIA_API_SECRET is required'),
  EXPEDIA_BASE_URL: z.string().url().default('https://api.expedia.com'),
  EXPEDIA_TIMEOUT: z.string().default('10000').transform(Number),
});
```

### Step 2: Add to Config Object

```typescript
// src/config/env.ts
export const config = {
  // ... existing config

  expedia: {
    apiKey: env.EXPEDIA_API_KEY,
    apiSecret: env.EXPEDIA_API_SECRET,
    baseUrl: env.EXPEDIA_BASE_URL,
    timeout: env.EXPEDIA_TIMEOUT,
  },
} as const;
```

### Step 3: Update .env.example

```bash
# .env.example

# ============================================
# Expedia API Configuration
# ============================================
EXPEDIA_API_KEY=your_api_key_here
EXPEDIA_API_SECRET=your_api_secret_here
EXPEDIA_BASE_URL=https://api.expedia.com
EXPEDIA_TIMEOUT=10000
```

### Step 4: Use in Your Code

```typescript
// src/clients/expediaClient.ts
import { config } from '../config/env.js';
import { createBaseClient } from './baseClient.js';

export function createExpediaClient() {
  return createBaseClient({
    baseURL: config.expedia.baseUrl,
    timeout: config.expedia.timeout,
    headers: {
      'X-API-Key': config.expedia.apiKey,
      'X-API-Secret': config.expedia.apiSecret,
    }
  });
}
```

## Example 6: Environment-Specific Behavior

```typescript
import { config, isDevelopment, isProduction } from './config/env.js';

// Different logging based on environment
if (isDevelopment) {
  console.log('Debug info:', {
    arc: config.vax.arc,
    username: config.vax.username,
    // Don't log password even in dev!
  });
}

// Production optimizations
if (isProduction) {
  // Disable verbose logging
  // Enable caching
  // Use production API endpoints
}

// Different Playwright settings
const browser = await chromium.launch({
  headless: config.playwright.headless, // true in production, false in dev
});
```

## Example 7: Optional Configuration

For optional features:

```typescript
// src/config/env.ts
const envSchema = z.object({
  // ... required variables

  // Optional feature flag
  ENABLE_ANALYTICS: z.string().optional().transform((val) => val === 'true'),

  // Optional API key
  SENDGRID_API_KEY: z.string().optional(),
});

export const config = {
  // ... other config

  features: {
    analytics: env.ENABLE_ANALYTICS ?? false,
  },

  email: {
    sendgridApiKey: env.SENDGRID_API_KEY,
  },
} as const;
```

Usage:

```typescript
import { config } from './config/env.js';

if (config.features.analytics) {
  // Analytics is enabled
  trackEvent('user_login');
}

if (config.email.sendgridApiKey) {
  // Email service is configured
  await sendEmail(config.email.sendgridApiKey, message);
}
```
