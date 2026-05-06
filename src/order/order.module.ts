import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CartModule } from '../cart/cart.module';
import { OrderItem } from '../order-item/entities/order-item.entity';
import { StoreItemClientModule } from '../store-item-client/store-item-client.module';
import { OrderController } from './order.controller';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { Order } from './entities/order.entity';

@Module({
  imports: [StoreItemClientModule, TypeOrmModule.forFeature([Order, OrderItem]), CartModule],
  controllers: [OrderController],
  providers: [OrderRepository, OrderService],
})
export class OrderModule {}
