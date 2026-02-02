import { settings } from "@/utils/settings.js";
import { Prisma, PrismaClient } from "./generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: settings.DATABASE_URL,
});

export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

export type * from "./generated/client/client.js";
export const Decimal = Prisma.Decimal;
