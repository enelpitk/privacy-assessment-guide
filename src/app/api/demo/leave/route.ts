import { cookies } from "next/headers";
import { route } from "@/lib/api";
import { DEMO_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST() {
  return route(
    async () => {
      const store = await cookies();
      store.delete(DEMO_COOKIE);
      return { ok: true };
    },
    { auth: false },
  );
}
