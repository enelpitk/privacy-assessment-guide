import { NextResponse } from "next/server";
import { safeMessage, HttpError } from "./errors";
import { getCurrentUser, type CurrentUser } from "./session";

export async function route(
  fn: (user: CurrentUser) => Promise<unknown>,
  opts: { auth?: boolean } = {},
): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    if (opts.auth !== false && !user) {
      throw new HttpError(401, "Choose a demo identity first.");
    }
    const data = await fn(user as CurrentUser);
    return NextResponse.json(data ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const { status, message } = safeMessage(e);
    const details = e instanceof HttpError ? e.details : undefined;
    if (status >= 500) console.error("API error:", (e as Error)?.name ?? "unknown"); // never log driver messages
    return NextResponse.json({ error: message, details }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "The request was not valid JSON.");
  }
}
