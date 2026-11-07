import { route } from "@/lib/api";
import { loadAccessible } from "@/server/access";
import { loadThreads } from "@/server/governanceData";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return route(async (user) => {
    const { versionId } = await loadAccessible(user, id);
    return { threads: await loadThreads(versionId, id) };
  });
}
