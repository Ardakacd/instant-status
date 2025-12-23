import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";

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

    if (exception instanceof HttpException) {
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

    // Log all errors except 404s 
    if (status !== HttpStatus.NOT_FOUND) {
      this.logger.warn(
        `${request.method} ${request.url} - ${status} - ${typeof message === "string" ? message : JSON.stringify(message)}`
      );
    }

    // Return consistent error format
    const errorResponse = {
      statusCode: status,
      message: Array.isArray(message) ? message : [message],
      error: error,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    response.status(status).json(errorResponse);
  }
}
