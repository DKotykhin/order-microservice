import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

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
  ],
  controllers: [CartController],
  providers: [CartService],
})
export class CartModule {}
