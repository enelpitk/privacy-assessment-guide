import { z } from "zod";
import { HttpError } from "@/lib/errors";
import { readJson, route } from "@/lib/api";
import { createRecord } from "@/server/structure";

export const dynamic = "force-dynamic";

const Body = z.object({
  collection: z.string().min(1).max(120),
  parentId: z.string().max(64).nullable().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return route(async (user) => {
    const body = Body.safeParse(await readJson(req));
    if (!body.success) throw new HttpError(400, "The request was not valid.");
    return createRecord(user, id, body.data.collection, body.data.parentId ?? null);
  });
}
