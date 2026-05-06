import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';

import { STORE_ITEM_SERVICE_NAME, STORE_ITEM_V1_PACKAGE_NAME } from 'src/generated-types/store-item';
import { CartModule } from '../cart/cart.module';
import { OrderItem } from '../order-item/entities/order-item.entity';
import { OrderController } from './order.controller';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { Order } from './entities/order.entity';

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
    TypeOrmModule.forFeature([Order, OrderItem]),
    CartModule,
  ],
  controllers: [OrderController],
  providers: [OrderRepository, OrderService],
})
export class OrderModule {}
