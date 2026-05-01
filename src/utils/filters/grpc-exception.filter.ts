import { Catch, RpcExceptionFilter } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { throwError } from 'rxjs';

@Catch(RpcException)
export class GrpcExceptionFilter implements RpcExceptionFilter {
  catch(exception: RpcException) {
    const error = exception.getError();
    const payload = typeof error === 'string' ? { message: error, code: 13 } : error;

    return throwError(() => payload);
  }
}
