import { Controller, Logger } from '@nestjs/common';

import {
  CartServiceControllerMethods,
  type AddToCartRequest,
  type CartResponse,
  type CartServiceController,
  type RemoveFromCartRequest,
  type StatusResponse,
  type UpdateCartItemRequest,
  type UserId,
} from 'src/generated-types/cart';
import { CartService } from './cart.service';

@Controller()
@CartServiceControllerMethods()
export class CartController implements CartServiceController {
  private readonly logger = new Logger(CartController.name);

  constructor(private readonly cartService: CartService) {}

  async getCart(request: UserId): Promise<CartResponse> {
    this.logger.log(`GetCart for userId: ${request.userId}`);
    return this.cartService.getCart(request.userId);
  }

  async addToCart(request: AddToCartRequest): Promise<CartResponse> {
    this.logger.log(`AddToCart for userId: ${request.userId}, productId: ${request.item?.productId}`);
    return this.cartService.addItem(request.userId, request.item!);
  }

  async updateCartItem(request: UpdateCartItemRequest): Promise<CartResponse> {
    this.logger.log(`UpdateCartItem for userId: ${request.userId}, productId: ${request.item?.productId}`);
    return this.cartService.updateItem(request.userId, request.item!);
  }

  async removeFromCart(request: RemoveFromCartRequest): Promise<CartResponse> {
    this.logger.log(`RemoveFromCart for userId: ${request.userId}, productId: ${request.productId}`);
    return this.cartService.removeItem(request.userId, request.productId, request.variantId);
  }

  async clearCart(request: UserId): Promise<StatusResponse> {
    this.logger.log(`ClearCart for userId: ${request.userId}`);
    return this.cartService.clearCart(request.userId);
  }
}
