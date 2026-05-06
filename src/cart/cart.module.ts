import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { CartAbandonmentModule } from 'src/cart-abandonment/cart-abandonment.module';
import { STORE_ITEM_SERVICE_NAME, STORE_ITEM_V1_PACKAGE_NAME } from 'src/generated-types/store-item';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: STORE_ITEM_SERVICE_NAME,
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: STORE_ITEM_V1_PACKAGE_NAME,
            protoPath: 'proto/store-item.proto',
            url: configService.getOrThrow<string>('STORE_SERVICE_URL'),
          },
        }),
        inject: [ConfigService],
      },
    ]),
    CartAbandonmentModule,
  ],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
