// apps/web/lib/api/parse.ts
import type { z } from "zod";
import { invalidBody } from "./errors";

/** Parses and validates a JSON body, turning Zod issues into a 400. */
export async function parseBody<T extends z.ZodTypeAny>(
  req: Request,
  schema: T,
): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw invalidBody([{ path: "", message: "Body must be valid JSON" }]);
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw invalidBody(
      parsed.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    );
  }
  return parsed.data;
}
