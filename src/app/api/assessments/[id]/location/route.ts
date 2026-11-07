import { z } from "zod";
import { HttpError } from "@/lib/errors";
import { readJson, route } from "@/lib/api";
import { rememberLocation } from "@/server/assessments";

export const dynamic = "force-dynamic";

const Body = z.object({ subsectionId: z.string().min(1).max(10) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return route(async (user) => {
    const body = Body.safeParse(await readJson(req));
    if (!body.success) throw new HttpError(400, "The request was not valid.");
    await rememberLocation(user, id, body.data.subsectionId);
    return { ok: true };
  });
}
