import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OrderStatusHistory } from './entities/order-status-history.entity';
import { OrderStatusHistoryService } from './order-status-history.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderStatusHistory])],
  providers: [OrderStatusHistoryService],
  exports: [OrderStatusHistoryService],
})
export class OrderStatusHistoryModule {}
