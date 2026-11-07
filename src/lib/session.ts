import { cookies } from "next/headers";
import { prisma } from "./db";
import type { Role } from "@/domain/permissions";

// The demo identity cookie holds a user id only. This is NOT authentication:
// anyone can pick any demo identity. The cookie is deliberately unsigned and
// carries no secret; the server re-reads the user and re-checks permissions on every request.
export const DEMO_COOKIE = "dpia_demo_user";

export interface CurrentUser {
  id: string;
  displayName: string;
  jobTitle: string;
  roles: Role[];
  departmentId: string | null;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const store = await cookies();
  const id = store.get(DEMO_COOKIE)?.value;
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id } });
  if (!u) return null;
  return {
    id: u.id,
    displayName: u.displayName,
    jobTitle: u.jobTitle,
    roles: u.roles as Role[],
    departmentId: u.departmentId,
  };
}
