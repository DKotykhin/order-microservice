import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';

import { GrpcExceptionFilter } from './utils/filters/grpc-exception.filter';
import { CART_V1_PACKAGE_NAME } from './generated-types/cart';
import { HEALTH_CHECK_V1_PACKAGE_NAME } from './generated-types/health-check';
import { ORDER_V1_PACKAGE_NAME } from './generated-types/order';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: process.env.NODE_ENV === 'production' ? ['error'] : ['log', 'debug', 'warn', 'error', 'verbose'],
  });

  const logger = new Logger('Main');

  const configService = app.get(ConfigService);
  const url = configService.getOrThrow<string>('TRANSPORT_URL');
  const PORT = configService.getOrThrow<number>('HTTP_PORT');

  app.useGlobalFilters(new GrpcExceptionFilter());

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: [HEALTH_CHECK_V1_PACKAGE_NAME, CART_V1_PACKAGE_NAME, ORDER_V1_PACKAGE_NAME],
      protoPath: ['proto/health-check.proto', 'proto/cart.proto', 'proto/order.proto'],
      url,
    },
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [configService.getOrThrow<string>('RABBITMQ_URL')],
      queue: configService.getOrThrow<string>('ORDER_EVENTS_RABBITMQ_QUEUE'),
      queueOptions: { durable: true },
      noAck: false,
    },
  });

  await app.startAllMicroservices();
  await app.listen(PORT);
  logger.log('Order microservice is running on ' + url);
  logger.log('HTTP server is running on port ' + PORT);
}
void bootstrap();
