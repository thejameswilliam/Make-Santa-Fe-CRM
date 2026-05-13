import "dotenv/config";

import { defineConfig } from "prisma/config";

const fallbackDatabaseUrl = "postgresql://placeholder:placeholder@localhost:5432/make_santa_fe_crm?schema=public";
const prismaCommandContext = `${process.env.npm_lifecycle_event ?? ""} ${process.argv.join(" ")}`;

function shouldAllowFallbackDatabaseUrl() {
  return prismaCommandContext.includes("db:generate") || prismaCommandContext.includes("prisma generate");
}

function getPrismaDatasourceUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  if (shouldAllowFallbackDatabaseUrl()) {
    return fallbackDatabaseUrl;
  }

  throw new Error(
    "DATABASE_URL is required for Prisma commands that talk to the database. " +
      "If this is a DigitalOcean schema-sync job, bind DATABASE_URL on the job component itself."
  );
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    // `prisma generate` does not need a live database connection, but App Platform
    // runs it during the build before runtime-only env vars are injected.
    url: getPrismaDatasourceUrl()
  }
});
