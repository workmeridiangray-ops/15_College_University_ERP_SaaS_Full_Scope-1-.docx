export class AppError extends Error {
  constructor(public code: "unauthenticated" | "forbidden" | "not_found" | "invalid" | "conflict" | "limit" | "suspended" | "rate_limited", message: string, public fields?: Record<string, string>) {
    super(message);
  }
}
export const forbidden = (m = "You do not have permission to do that.") => new AppError("forbidden", m);
export const notFound = (m = "Record not found.") => new AppError("not_found", m);
export const invalid = (m: string, fields?: Record<string, string>) => new AppError("invalid", m, fields);
export const conflict = (m: string) => new AppError("conflict", m);
