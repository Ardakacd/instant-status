import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ZodError } from "zod";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | object;
    let error: string;
    let errorCode: string | undefined;

    // Handle Zod validation errors
    if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      error = "Validation Error";
      // Format Zod errors into objects with field and message for frontend ease
      message = exception.errors.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // Handle different response formats
      if (typeof exceptionResponse === "string") {
        message = exceptionResponse;
        error = exception.name;
      } else if (typeof exceptionResponse === "object") {
        const responseObj = exceptionResponse as any;
        // ValidationPipe returns message as array, other exceptions may return string
        message = responseObj.message || exception.message;
        error = responseObj.error || exception.name;
        // Extract errorCode if present (for structured error handling)
        errorCode = responseObj.errorCode;
      } else {
        message = exception.message;
        error = exception.name;
      }
    } else {
      
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = "An error occurred";
      error = "InternalServerError";

      
      this.logger.error(
        `Unexpected error: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
        `${request.method} ${request.url}`
      );
    }

    // Log all errors except 404s and expected 401s during app initialization
    const isExpected401 = 
      status === HttpStatus.UNAUTHORIZED && 
      errorCode === 'AUTH_REQUIRED';

    if (status !== HttpStatus.NOT_FOUND && !isExpected401) {
      this.logger.warn(
        `${request.method} ${request.url} - ${status} - ${typeof message === "string" ? message : JSON.stringify(message)}`
      );
    }

    // Return consistent error format
    const errorResponse: any = {
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      error: error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    // Add errorCode if present (for structured error handling on frontend)
    if (errorCode) {
      errorResponse.errorCode = errorCode;
    }

    response.status(status).json(errorResponse);
  }
}
