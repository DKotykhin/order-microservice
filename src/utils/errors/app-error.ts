import { RpcException } from '@nestjs/microservices';
import { RpcErrorCode } from './rpc-error-code.enum';

export class AppError extends RpcException {
  constructor(error: { message: string; code: number | string }) {
    super(error);
  }
  static unprocessableEntity(message = 'Unprocessable Entity') {
    return new AppError({ message, code: RpcErrorCode.UNPROCESSABLE_ENTITY });
  }

  static badRequest(message = 'Bad Request') {
    return new AppError({ message, code: RpcErrorCode.BAD_REQUEST });
  }

  static gatewayTimeout(message = 'Gateway Timeout') {
    return new AppError({ message, code: RpcErrorCode.GATEWAY_TIMEOUT });
  }

  static notFound(message = 'Not Found') {
    return new AppError({ message, code: RpcErrorCode.NOT_FOUND });
  }

  static conflict(message = 'Conflict') {
    return new AppError({ message, code: RpcErrorCode.CONFLICT });
  }

  static forbidden(message = 'Forbidden') {
    return new AppError({ message, code: RpcErrorCode.FORBIDDEN });
  }

  static tooManyRequests(message = 'Too Many Requests') {
    return new AppError({ message, code: RpcErrorCode.TOO_MANY_REQUESTS });
  }

  static preconditionFailed(message = 'Precondition Failed') {
    return new AppError({ message, code: RpcErrorCode.PRECONDITION_FAILED });
  }

  static requestTimeout(message = 'Request Timeout') {
    return new AppError({ message, code: RpcErrorCode.ABORTED });
  }

  static outOfRange(message = 'Out of Range') {
    return new AppError({ message, code: RpcErrorCode.OUT_OF_RANGE });
  }

  static notImplemented(message = 'Not Implemented') {
    return new AppError({ message, code: RpcErrorCode.NOT_IMPLEMENTED });
  }

  static unauthorized(message = 'Unauthorized') {
    return new AppError({ message, code: RpcErrorCode.UNAUTHORIZED });
  }

  static serviceUnavailable(message = 'Service Unavailable') {
    return new AppError({ message, code: RpcErrorCode.SERVICE_UNAVAILABLE });
  }

  static internalServerError(message = 'Internal Server Error') {
    return new AppError({ message, code: RpcErrorCode.INTERNAL });
  }
}
