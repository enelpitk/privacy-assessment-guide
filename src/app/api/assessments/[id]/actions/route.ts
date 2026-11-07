import { HttpError } from "@/lib/errors";
import { readJson, route } from "@/lib/api";
import { ActionSchema } from "@/server/actionSchema";
import { runAction } from "@/server/governance";

export const dynamic = "force-dynamic";

// One endpoint for every workflow and collaboration action. Permissions, workflow state and locks are
// re-checked on the server for each call; the UI only decides which buttons to show.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return route(async (user) => {
    const body = ActionSchema.safeParse(await readJson(req));
    if (!body.success) throw new HttpError(400, "The request was not valid.");
    return runAction(user, id, body.data);
  });
}
