import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { USER_SERVICE_NAME, USER_V1_PACKAGE_NAME } from 'src/generated-types/user';
import { CartAbandonmentProcessor } from './cart-abandonment.processor';
import { CartAbandonmentService, CART_ABANDONMENT_QUEUE } from './cart-abandonment.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: CART_ABANDONMENT_QUEUE }),
    ClientsModule.registerAsync([
      {
        name: USER_SERVICE_NAME,
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: USER_V1_PACKAGE_NAME,
            protoPath: 'proto/user.proto',
            url: configService.getOrThrow<string>('USER_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [CartAbandonmentService, CartAbandonmentProcessor],
  exports: [CartAbandonmentService],
})
export class CartAbandonmentModule {}
