import { Module } from '@nestjs/common';

import { CartModule } from 'src/cart/cart.module';
import { StoreItemClientModule } from 'src/store-item-client/store-item-client.module';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

@Module({
  imports: [StoreItemClientModule, CartModule],
  controllers: [WishlistController],
  providers: [WishlistService],
})
export class WishlistModule {}
