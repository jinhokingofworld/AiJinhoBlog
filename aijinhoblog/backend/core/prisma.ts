import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "@/backend/generated/prisma";

const databaseUrl =
  process.env.DATABASE_URL ?? "mysql://aijinho:aijinho_password@localhost:3306/aijinhoblog";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const createPrismaClient = () =>
  new PrismaClient({
    adapter: new PrismaMariaDb(databaseUrl),
  });

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
