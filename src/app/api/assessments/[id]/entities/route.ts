import { z } from "zod";
import { HttpError } from "@/lib/errors";
import { readJson, route } from "@/lib/api";
import { createEntity } from "@/server/structure";

export const dynamic = "force-dynamic";

const Body = z.object({ kind: z.string().max(30), name: z.string().max(300) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return route(async (user) => {
    const body = Body.safeParse(await readJson(req));
    if (!body.success) throw new HttpError(400, "The request was not valid.");
    return createEntity(user, id, body.data.kind, body.data.name);
  });
}
