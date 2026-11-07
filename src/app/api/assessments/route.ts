import { z } from "zod";
import { HttpError } from "@/lib/errors";
import { readJson, route } from "@/lib/api";
import { createAssessment } from "@/server/assessments";

export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().max(300),
  departmentId: z.string().min(1).max(64),
  assignedDpoId: z.string().min(1).max(64),
});

export async function POST(req: Request) {
  return route(async (user) => {
    const body = Body.safeParse(await readJson(req));
    if (!body.success) throw new HttpError(400, "Enter a name, department and DPO.");
    return createAssessment(user, body.data);
  });
}
