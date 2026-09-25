import { HttpsError } from "firebase-functions/v2/https";

export function toHttpsError(err: unknown): HttpsError {
  if (err instanceof HttpsError) return err;
  const message = err instanceof Error ? err.message : "Unknown error";
  return new HttpsError("internal", message);
}
