import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { readJson, route } from "@/lib/api";
import { DEMO_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

const Body = z.object({ userId: z.string().min(1).max(64) });

export async function POST(req: Request) {
  return route(
    async () => {
      const body = Body.safeParse(await readJson(req));
      if (!body.success) throw new HttpError(400, "Choose a demo user.");
      const user = await prisma.user.findUnique({ where: { id: body.data.userId } });
      if (!user) throw new HttpError(404, "That demo user does not exist.");
      const store = await cookies();
      store.set(DEMO_COOKIE, user.id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
      return { ok: true };
    },
    { auth: false },
  );
}
