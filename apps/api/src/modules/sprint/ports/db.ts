import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';

/** A Prisma transaction handle. A service that writes several rows receives one of these. */
export type Tx = Prisma.TransactionClient;

/** Either the Prisma client or a transaction: both can run the same queries. */
export type Db = PrismaClient | Tx;
