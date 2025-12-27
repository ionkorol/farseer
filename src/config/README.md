# Configuration Guide

This directory contains the application configuration system using Zod for type-safe environment variable validation.

## Overview

The configuration system provides:
- **Type-safe environment variables** - All env vars are validated at startup
- **Helpful error messages** - Clear feedback when variables are missing or invalid
- **Default values** - Sensible defaults for optional configuration
- **Organized config object** - Grouped by feature for easy access

## Usage

Instead of accessing `process.env` directly, import the validated config:

```typescript
import { config } from './config/env.js';

// Access validated configuration
console.log(config.vax.username);
console.log(config.pricing.markupPercentage);
console.log(config.playwright.headless);
```

## Adding New Environment Variables

To add a new environment variable:

### 1. Update the Zod Schema

Edit [env.ts](env.ts) and add your variable to the `envSchema`:

```typescript
const envSchema = z.object({
  // ... existing variables

  // Add your new variable
  NEW_API_KEY: z.string().min(1, 'NEW_API_KEY is required'),

  // Or with a default value
  NEW_API_TIMEOUT: z.string().default('5000').transform(Number),

  // Or as optional
  OPTIONAL_FEATURE: z.string().optional(),
});
```

### 2. Add to Config Object

Add the variable to the `config` object for organized access:

```typescript
export const config = {
  // ... existing sections

  newApi: {
    apiKey: env.NEW_API_KEY,
    timeout: env.NEW_API_TIMEOUT,
    optionalFeature: env.OPTIONAL_FEATURE,
  },
} as const;
```

### 3. Update .env.example

Document the new variable in `.env.example`:

```bash
# ============================================
# New API Configuration
# ============================================
NEW_API_KEY=your_api_key_here
NEW_API_TIMEOUT=5000
# OPTIONAL_FEATURE=some_value
```

### 4. Update .env

Add the actual value to your local `.env` file (not committed to git).

## Validation Examples

### String Validation

```typescript
// Required string
API_KEY: z.string().min(1, 'API_KEY is required'),

// String with pattern
EMAIL: z.string().email('Invalid email format'),

// String with custom validation
USERNAME: z.string().min(3).max(20),
```

### Number Validation

```typescript
// Transform string to number with validation
PORT: z.string().default('3000').transform(Number),

// Number with range validation
TIMEOUT: z.string()
  .default('30000')
  .transform(Number)
  .pipe(z.number().min(1000).max(60000)),

// Percentage (0-100)
MARKUP: z.string()
  .default('10')
  .transform(Number)
  .pipe(z.number().min(0).max(100)),
```

### Boolean Validation

```typescript
// Transform string to boolean
HEADLESS: z.string()
  .default('true')
  .transform((val) => val === 'true'),

// Or use enum for clarity
DEBUG_MODE: z.enum(['true', 'false'])
  .default('false')
  .transform((val) => val === 'true'),
```

### Enum Validation

```typescript
// Limited set of values
LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
```

### Optional Values

```typescript
// Optional string
OPTIONAL_API_KEY: z.string().optional(),

// Optional with transformation
OPTIONAL_PORT: z.string().optional().transform((val) =>
  val ? Number(val) : undefined
),
```

## Environment Variables Reference

See [.env.example](../../.env.example) for the complete list of available environment variables and their descriptions.

## Error Handling

When validation fails, the app will exit with a detailed error message:

```
❌ Environment validation failed:

  VAX_USERNAME:
    - String must contain at least 1 character(s)

  MARKUP_PERCENTAGE:
    - Number must be less than or equal to 100

Please check your .env file and ensure all required variables are set.
See .env.example for reference.
```

## Helper Functions

The config module exports several helper functions:

```typescript
import { isDevelopment, isProduction, isTest } from './config/env.js';

if (isDevelopment) {
  console.log('Running in development mode');
}

if (isProduction) {
  // Enable production optimizations
}
```

## Best Practices

1. **Never commit `.env` files** - They contain secrets
2. **Always update `.env.example`** - Document all required variables
3. **Use descriptive error messages** - Help developers fix issues quickly
4. **Provide sensible defaults** - For non-sensitive configuration
5. **Group related config** - Use the config object for organization
6. **Validate early** - Let the app fail fast on startup if config is invalid
