import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __trackwisePrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.PRISMA_LOG === "query" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

/** Singleton Prisma client (re-used across Next.js hot reloads). */
export const prisma: PrismaClient = globalThis.__trackwisePrisma ?? createClient();
if (process.env.NODE_ENV !== "production") globalThis.__trackwisePrisma = prisma;

export type Db = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
