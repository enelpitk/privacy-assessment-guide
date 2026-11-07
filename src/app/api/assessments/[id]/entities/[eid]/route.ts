import { z } from "zod";
import { HttpError } from "@/lib/errors";
import { readJson, route } from "@/lib/api";
import { deleteEntity, renameEntity } from "@/server/structure";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ id: string; eid: string }> };

const Rename = z.object({ name: z.string().max(300), baseRevision: z.number().int().min(0) });
const Del = z.object({ baseRevision: z.number().int().min(0), unlink: z.boolean().optional() });

export async function PATCH(req: Request, ctx: P) {
  const { id, eid } = await ctx.params;
  return route(async (user) => {
    const body = Rename.safeParse(await readJson(req));
    if (!body.success) throw new HttpError(400, "The request was not valid.");
    return renameEntity(user, id, eid, body.data.name, body.data.baseRevision);
  });
}

export async function DELETE(req: Request, ctx: P) {
  const { id, eid } = await ctx.params;
  return route(async (user) => {
    const body = Del.safeParse(await readJson(req));
    if (!body.success) throw new HttpError(400, "The request was not valid.");
    return deleteEntity(user, id, eid, body.data.baseRevision, body.data.unlink === true);
  });
}
