export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, "BAD_REQUEST", details);
export const unauthorized = (message = "Authentication required") => new HttpError(401, message, "UNAUTHORIZED");
export const forbidden = (message = "You are not allowed to perform this action") =>
  new HttpError(403, message, "FORBIDDEN");
export const notFound = (message = "Not found") => new HttpError(404, message, "NOT_FOUND");
export const conflict = (message: string) => new HttpError(409, message, "CONFLICT");
export const unavailable = (message: string) => new HttpError(503, message, "SERVICE_UNAVAILABLE");
