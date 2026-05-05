import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { CartAbandonmentProcessor } from './cart-abandonment.processor';
import { CartAbandonmentService, CART_ABANDONMENT_QUEUE } from './cart-abandonment.service';

@Module({
  imports: [BullModule.registerQueue({ name: CART_ABANDONMENT_QUEUE })],
  providers: [CartAbandonmentService, CartAbandonmentProcessor],
  exports: [CartAbandonmentService],
})
export class CartAbandonmentModule {}
