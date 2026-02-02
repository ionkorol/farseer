import { z } from "zod";
import "dotenv/config";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("development"),
  PORT: z.string().default("3000").transform(Number),

  DATABASE_URL: z.string(),

  VAX_ARC: z.string().min(1, "VAX_ARC is required"),
  VAX_USERNAME: z.string().min(1, "VAX_USERNAME is required"),
  VAX_PASSWORD: z.string().min(1, "VAX_PASSWORD is required"),

  MARKUP_PERCENTAGE: z.string().default("10").transform(Number).pipe(z.number().min(0).max(100)),

  RATE_LIMIT_MAX_REQUESTS: z.string().default("100").transform(Number),
  RATE_LIMIT_WINDOW_MS: z.string().default("60000").transform(Number),

  SESSION_CACHE_ENABLED: z
    .string()
    .default("true")
    .transform((val) => val === "true"),
  SESSION_TTL_HOURS: z.string().default("2").transform(Number).pipe(z.number().min(0.5).max(24)),
});

export const settings = envSchema.parse(process.env);

if (settings.NODE_ENV === "production") {
  console.log("✓ Environment configuration loaded successfully");
  console.log(`  - PORT: ${settings.PORT}`);
}
