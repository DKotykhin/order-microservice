import { Controller, Logger } from '@nestjs/common';

import {
  WishlistServiceControllerMethods,
  type AddToCartRequest,
  type CartResponse,
  type RemoveFromCartRequest,
  type UserId,
  type WishlistServiceController,
} from 'src/generated-types/cart';
import { WishlistService } from './wishlist.service';

@Controller()
@WishlistServiceControllerMethods()
export class WishlistController implements WishlistServiceController {
  private readonly logger = new Logger(WishlistController.name);

  constructor(private readonly wishlistService: WishlistService) {}

  async getWishlist(request: UserId): Promise<CartResponse> {
    this.logger.log(`GetWishlist for userId: ${request.userId}`);
    return this.wishlistService.getWishlist(request.userId);
  }

  async addToWishlist(request: AddToCartRequest): Promise<CartResponse> {
    this.logger.log(`AddToWishlist for userId: ${request.userId}, productId: ${request.item?.productId}`);
    return this.wishlistService.addItem(request.userId, request.item!);
  }

  async removeFromWishlist(request: RemoveFromCartRequest): Promise<CartResponse> {
    this.logger.log(`RemoveFromWishlist for userId: ${request.userId}, productId: ${request.productId}`);
    return this.wishlistService.removeItem(request.userId, request.productId, request.variantId);
  }

  async moveToCart(request: RemoveFromCartRequest): Promise<CartResponse> {
    this.logger.log(`MoveToCart for userId: ${request.userId}, productId: ${request.productId}`);
    return this.wishlistService.moveToCart(request.userId, request.productId, request.variantId);
  }

  async moveToWishlist(request: RemoveFromCartRequest): Promise<CartResponse> {
    this.logger.log(`MoveToWishlist for userId: ${request.userId}, productId: ${request.productId}`);
    return this.wishlistService.moveToWishlist(request.userId, request.productId, request.variantId);
  }
}
