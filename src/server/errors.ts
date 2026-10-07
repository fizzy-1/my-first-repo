/**
 * Typed application errors thrown by the services layer. Server actions convert
 * them into user-facing messages; anything else is treated as an internal error
 * and never leaked to the client.
 */
export type AppErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: AppErrorCode,
    public readonly fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, "FORBIDDEN");
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Record") {
    super(`${entity} not found.`, "NOT_FOUND");
  }
}

export class ValidationError extends AppError {
  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message, "VALIDATION", fieldErrors);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT");
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
