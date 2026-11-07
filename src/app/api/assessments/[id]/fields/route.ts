import { z } from "zod";
import { HttpError } from "@/lib/errors";
import { readJson, route } from "@/lib/api";
import { saveChanges } from "@/server/save";

export const dynamic = "force-dynamic";

const Change = z.object({
  fieldId: z.string().min(1).max(120),
  recordId: z.string().max(64),
  baseRevision: z.number().int().min(0),
  value: z.unknown().optional(),
  state: z.enum(["ANSWERED", "UNANSWERED", "NOT_APPLICABLE", "NOT_SURE", "COMPLETE_LATER"]),
  rationale: z.string().max(5000).nullable().optional(),
});
const Body = z.object({ changes: z.array(Change).min(1).max(60) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return route(async (user) => {
    const body = Body.safeParse(await readJson(req));
    if (!body.success) throw new HttpError(400, "The save request was not valid.");
    const results = await saveChanges(user, id, body.data.changes);
    return { results };
  });
}
