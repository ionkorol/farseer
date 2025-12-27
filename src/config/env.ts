import { z } from "zod";
import "dotenv/config";

/**
 * Environment validation schema using Zod
 * All required environment variables must be defined here
 */
const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  // Application Settings
  PORT: z.string().default("3000").transform(Number),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // VAX Vacation Access Credentials
  VAX_ARC: z.string().min(1, "VAX_ARC is required"),
  VAX_USERNAME: z.string().min(1, "VAX_USERNAME is required"),
  VAX_PASSWORD: z.string().min(1, "VAX_PASSWORD is required"),

  // Markup Configuration
  MARKUP_PERCENTAGE: z.string().default("10").transform(Number).pipe(z.number().min(0).max(100)),

  // Rate Limiting
  RATE_LIMIT_MAX_REQUESTS: z.string().default("100").transform(Number),
  RATE_LIMIT_WINDOW_MS: z.string().default("60000").transform(Number),

  // Playwright Configuration
  PLAYWRIGHT_HEADLESS: z
    .string()
    .default("true")
    .transform((val) => val === "true"),
  PLAYWRIGHT_TIMEOUT: z.string().default("30000").transform(Number),

  // Session Management
  SESSION_CACHE_ENABLED: z
    .string()
    .default("true")
    .transform((val) => val === "true"),
  SESSION_TTL_HOURS: z.string().default("2").transform(Number).pipe(z.number().min(0.5).max(24)),

  // Optional: Additional API Credentials (add as needed)
  // EXAMPLE_API_KEY: z.string().optional(),
  // EXAMPLE_API_SECRET: z.string().optional(),
});

/**
 * Inferred TypeScript type from the Zod schema
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Parse and validate environment variables
 * Throws an error if validation fails with detailed error messages
 */
function parseEnv(): Env {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error("❌ Environment validation failed:");
    console.error("");

    const errors = result.error.flatten().fieldErrors;
    Object.entries(errors).forEach(([field, messages]) => {
      console.error(`  ${field}:`);
      messages?.forEach((message) => {
        console.error(`    - ${message}`);
      });
    });

    console.error("");
    console.error("Please check your .env file and ensure all required variables are set.");
    console.error("See .env.example for reference.");

    throw new Error("Environment validation failed");
  }

  return result.data;
}

/**
 * Validated and typed environment configuration
 * Import this in your application instead of using process.env directly
 */
export const env = parseEnv();

/**
 * Check if running in production
 */
export const isProduction = env.NODE_ENV === "production";

/**
 * Check if running in development
 */
export const isDevelopment = env.NODE_ENV === "development";

/**
 * Check if running in test mode
 */
export const isTest = env.NODE_ENV === "test";

/**
 * Configuration object organized by feature
 */
export const config = {
  app: {
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    env: env.NODE_ENV,
  },

  vax: {
    arc: env.VAX_ARC,
    username: env.VAX_USERNAME,
    password: env.VAX_PASSWORD,
  },

  pricing: {
    markupPercentage: env.MARKUP_PERCENTAGE,
  },

  rateLimit: {
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
  },

  playwright: {
    headless: env.PLAYWRIGHT_HEADLESS,
    timeout: env.PLAYWRIGHT_TIMEOUT,
  },

  session: {
    cacheEnabled: env.SESSION_CACHE_ENABLED,
    ttlHours: env.SESSION_TTL_HOURS,
    ttlMs: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  },
} as const;

// Log successful configuration load in development
if (isDevelopment) {
  console.log("✓ Environment configuration loaded successfully");
  console.log(`  Environment: ${config.app.env}`);
  console.log(`  Port: ${config.app.port}`);
  console.log(`  Markup: ${config.pricing.markupPercentage}%`);
}
