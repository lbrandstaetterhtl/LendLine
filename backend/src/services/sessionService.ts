import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Signs the matching users out everywhere at once: refresh tokens are revoked, and raising
 * `sessionVersion` makes their access tokens fail in `requireAuth` right away instead of after
 * `JWT_ACCESS_TTL`. Returns the number of refresh tokens revoked.
 */
export async function endAllSessions(db: Db, where: Prisma.UserWhereInput): Promise<number> {
  await db.user.updateMany({ where, data: { sessionVersion: { increment: 1 } } });
  const { count } = await db.refreshToken.updateMany({
    where: { user: where, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return count;
}
