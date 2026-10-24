export type AppErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "INVALID_STATE"
  | "PROVIDER_ERROR"
  | "RATE_LIMITED";

const STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  INVALID_STATE: 409,
  PROVIDER_ERROR: 502,
  RATE_LIMITED: 429,
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: AppErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }
}

export const forbidden = (msg = "Forbidden") => new AppError("FORBIDDEN", msg);
export const notFound = (what = "Resource") => new AppError("NOT_FOUND", `${what} not found`);
export const validation = (msg: string, details?: unknown) => new AppError("VALIDATION", msg, details);
export const invalidState = (msg: string) => new AppError("INVALID_STATE", msg);
export const unauthenticated = (msg = "Not authenticated") => new AppError("UNAUTHENTICATED", msg);
