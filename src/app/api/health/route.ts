import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { describeDbProblem } from "@/lib/errors";

export const dynamic = "force-dynamic";

// Always answers 200 while the app is running, and reports database reachability without any detail.
export async function GET() {
  let database: "ok" | "not-configured" | "unreachable" | "not-migrated" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.user.count();
  } catch (e) {
    const p = describeDbProblem(e);
    database = p ? (p.kind === "unknown" ? "error" : p.kind) : "error";
  }
  // Railway provides the deployed commit; showing the short id lets a deployment be confirmed.
  const commit = process.env.RAILWAY_GIT_COMMIT_SHA ? process.env.RAILWAY_GIT_COMMIT_SHA.slice(0, 7) : null;
  return NextResponse.json({ app: "ok", database, commit }, { headers: { "Cache-Control": "no-store" } });
}
