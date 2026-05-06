import { Module } from '@nestjs/common';

import { CartAbandonmentModule } from 'src/cart-abandonment/cart-abandonment.module';
import { StoreItemClientModule } from 'src/store-item-client/store-item-client.module';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';

@Module({
  imports: [StoreItemClientModule, CartAbandonmentModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
