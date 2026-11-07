// Understandable, credential-free error handling.

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export interface DbProblem {
  kind: "unreachable" | "not-configured" | "not-migrated" | "unknown";
  title: string;
  advice: string;
}

/** Map any thrown value to a safe description. Never includes connection strings or driver messages. */
export function describeDbProblem(e: unknown): DbProblem | null {
  const name = (e as { name?: string })?.name ?? "";
  const code = (e as { code?: string })?.code ?? "";
  const msg = String((e as { message?: string })?.message ?? "");
  if (/DATABASE_URL|Environment variable not found/i.test(msg)) {
    return {
      kind: "not-configured",
      title: "The database is not configured",
      advice:
        "The DATABASE_URL environment variable is missing. In Railway, reference the Postgres service’s connection variable from the app service.",
    };
  }
  if (code === "P2021" || code === "P2022" || /does not exist in the current database/i.test(msg)) {
    return {
      kind: "not-migrated",
      title: "The database has not been prepared yet",
      advice:
        "The tables are missing. Migrations run when the app starts on Railway; check the deploy logs for a migration failure.",
    };
  }
  if (
    name === "PrismaClientInitializationError" ||
    code === "P1001" ||
    code === "P1000" ||
    code === "P1002" ||
    code === "P1003" ||
    code === "P1017"
  ) {
    return {
      kind: "unreachable",
      title: "The database cannot be reached",
      advice:
        "Check that the Postgres service is online and that the app’s DATABASE_URL points to it. Your saved work is not affected.",
    };
  }
  if (name.startsWith("PrismaClient")) {
    return {
      kind: "unknown",
      title: "A database problem occurred",
      advice: "Try again in a moment. If it keeps happening, check the deployment logs.",
    };
  }
  return null;
}

export function safeMessage(e: unknown): { status: number; message: string } {
  if (e instanceof HttpError) return { status: e.status, message: e.message };
  const db = describeDbProblem(e);
  if (db) return { status: 503, message: `${db.title}. ${db.advice}` };
  return { status: 500, message: "Something went wrong on the server." };
}
