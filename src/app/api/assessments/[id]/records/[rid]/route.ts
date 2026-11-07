import { z } from "zod";
import { HttpError } from "@/lib/errors";
import { readJson, route } from "@/lib/api";
import { deleteRecord, moveRecord } from "@/server/structure";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ id: string; rid: string }> };

const Del = z.object({ baseRevision: z.number().int().min(0) });
const Move = z.object({ direction: z.enum(["up", "down"]), baseRevision: z.number().int().min(0) });

export async function DELETE(req: Request, ctx: P) {
  const { id, rid } = await ctx.params;
  return route(async (user) => {
    const body = Del.safeParse(await readJson(req));
    if (!body.success) throw new HttpError(400, "The request was not valid.");
    await deleteRecord(user, id, rid, body.data.baseRevision);
    return { ok: true };
  });
}

export async function PATCH(req: Request, ctx: P) {
  const { id, rid } = await ctx.params;
  return route(async (user) => {
    const body = Move.safeParse(await readJson(req));
    if (!body.success) throw new HttpError(400, "The request was not valid.");
    await moveRecord(user, id, rid, body.data.direction, body.data.baseRevision);
    return { ok: true };
  });
}
