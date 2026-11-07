import { route } from "@/lib/api";
import { loadGovernance } from "@/server/governanceData";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return route(async (user) => ({ gov: await loadGovernance(user, id) }));
}
