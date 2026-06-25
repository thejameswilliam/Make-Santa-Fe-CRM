import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import type { PoolConfig } from "pg";

import { config } from "@/lib/config";

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const poolConfig = buildPoolConfig();
  const adapter = new PrismaPg(poolConfig);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });
}

function buildPoolConfig(): PoolConfig {
  if (!config.databaseCaCert) {
    return {
      connectionString: config.databaseUrl
    };
  }

  return {
    connectionString: stripSslModeFromConnectionString(config.databaseUrl),
    ssl: {
      ca: config.databaseCaCert,
      rejectUnauthorized: true
    }
  };
}

function stripSslModeFromConnectionString(connectionString: string) {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return connectionString;
  }
}

export const prisma = config.hasDatabase
  ? globalForPrisma.prisma ?? createPrismaClient()
  : null;

if (process.env.NODE_ENV !== "production" && prisma) {
  globalForPrisma.prisma = prisma;
}
