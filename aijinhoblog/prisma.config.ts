import { defineConfig } from "prisma/config";

const databaseUrl =
  process.env.DATABASE_URL ?? "mysql://aijinho:aijinho_password@localhost:3306/aijinhoblog";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: databaseUrl,
  },
});
