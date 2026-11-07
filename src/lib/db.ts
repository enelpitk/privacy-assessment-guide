import { PrismaClient } from "@prisma/client";

// Creating the client does not connect. No query runs at build time.
const g = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma: PrismaClient = g.__prisma ?? new PrismaClient({ log: [] });

if (process.env.NODE_ENV !== "production") g.__prisma = prisma;
