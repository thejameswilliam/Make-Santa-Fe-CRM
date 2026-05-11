import "dotenv/config";

import { defineConfig } from "prisma/config";

const fallbackDatabaseUrl = "postgresql://placeholder:placeholder@localhost:5432/make_santa_fe_crm?schema=public";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    // `prisma generate` does not need a live database connection, but App Platform
    // runs it during the build before runtime-only env vars are injected.
    url: process.env.DATABASE_URL ?? fallbackDatabaseUrl
  }
});
