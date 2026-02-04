import { settings } from "@/utils/settings.js";
import { Prisma, PrismaClient } from "./generated/client/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: settings.DATABASE_URL,
});

const log: Prisma.LogLevel[] = ["error"];
if (settings.NODE_ENV === "development") {
  log.push("info", "warn");
}

export const prisma = new PrismaClient({
  adapter,
  log,
});

export type * from "./generated/client/client.js";
export const Decimal = Prisma.Decimal;
