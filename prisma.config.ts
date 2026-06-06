import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Postgres connection string. DATABASE_URL is required in .env / CI; the
    // fallback points at the conventional local dev database so a forgotten
    // env var fails fast against localhost rather than silently writing
    // somewhere unexpected.
    url:
      process.env["DATABASE_URL"] ??
      "postgresql://bcon:bcon_dev@127.0.0.1:5432/bcon?schema=public",
  },
});
