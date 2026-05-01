import {
  Currency,
  type AddToCartRequest,
  type CartItem,
  type CartItemInput,
  type CartResponse,
  type RemoveFromCartRequest,
  type UpdateCartItemRequest,
  type UserId,
} from 'src/generated-types/cart';
import { AppError } from 'src/utils/errors/app-error';

import { CartController } from '../cart.controller';
import { CartService } from '../cart.service';

const mockCartService = {
  getCart: jest.fn(),
  addItem: jest.fn(),
  updateItem: jest.fn(),
  removeItem: jest.fn(),
  clearCart: jest.fn(),
};

const userId = 'user-123';

// Client-supplied input — no price/currency
const mockInputItem: CartItemInput = {
  productId: 'product-1',
  quantity: 2,
  variantId: undefined,
};

// Server-enriched item used in response fixtures
const mockStoredItem: CartItem = {
  productId: 'product-1',
  quantity: 2,
  variantId: undefined,
  price: 10.0,
  currency: Currency.CURRENCY_USD,
};

const mockCartResponse: CartResponse = {
  userId,
  items: [mockStoredItem],
  total: 20.0,
  currency: Currency.CURRENCY_USD,
};

describe('CartController', () => {
  let controller: CartController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CartController(mockCartService as unknown as CartService);
  });

  describe('getCart', () => {
    it('should call cartService.getCart with userId', async () => {
      mockCartService.getCart.mockResolvedValue(mockCartResponse);
      const request: UserId = { userId };

      await controller.getCart(request);

      expect(mockCartService.getCart).toHaveBeenCalledWith(userId);
    });

    it('should return the cart response from service', async () => {
      mockCartService.getCart.mockResolvedValue(mockCartResponse);

      const result = await controller.getCart({ userId });

      expect(result).toEqual(mockCartResponse);
    });

    it('should propagate errors from service', async () => {
      mockCartService.getCart.mockRejectedValue(AppError.internalServerError());

      await expect(controller.getCart({ userId })).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('addToCart', () => {
    it('should call cartService.addItem with userId and item', async () => {
      mockCartService.addItem.mockResolvedValue(mockCartResponse);
      const request: AddToCartRequest = { userId, item: mockInputItem };

      await controller.addToCart(request);

      expect(mockCartService.addItem).toHaveBeenCalledWith(userId, mockInputItem);
    });

    it('should return the updated cart response from service', async () => {
      mockCartService.addItem.mockResolvedValue(mockCartResponse);

      const result = await controller.addToCart({ userId, item: mockInputItem });

      expect(result).toEqual(mockCartResponse);
    });

    it('should propagate errors from service', async () => {
      mockCartService.addItem.mockRejectedValue(AppError.internalServerError());

      await expect(controller.addToCart({ userId, item: mockInputItem })).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('updateCartItem', () => {
    it('should call cartService.updateItem with userId and item', async () => {
      mockCartService.updateItem.mockResolvedValue(mockCartResponse);
      const request: UpdateCartItemRequest = { userId, item: mockInputItem };

      await controller.updateCartItem(request);

      expect(mockCartService.updateItem).toHaveBeenCalledWith(userId, mockInputItem);
    });

    it('should return the updated cart response from service', async () => {
      mockCartService.updateItem.mockResolvedValue(mockCartResponse);

      const result = await controller.updateCartItem({ userId, item: mockInputItem });

      expect(result).toEqual(mockCartResponse);
    });

    it('should propagate notFound error from service', async () => {
      mockCartService.updateItem.mockRejectedValue(AppError.notFound());

      await expect(controller.updateCartItem({ userId, item: mockInputItem })).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('removeFromCart', () => {
    it('should call cartService.removeItem with userId, productId, and no variantId', async () => {
      mockCartService.removeItem.mockResolvedValue(mockCartResponse);
      const request: RemoveFromCartRequest = { userId, productId: 'product-1' };

      await controller.removeFromCart(request);

      expect(mockCartService.removeItem).toHaveBeenCalledWith(userId, 'product-1', undefined);
    });

    it('should call cartService.removeItem with variantId when provided', async () => {
      mockCartService.removeItem.mockResolvedValue(mockCartResponse);
      const request: RemoveFromCartRequest = { userId, productId: 'product-1', variantId: 'variant-1' };

      await controller.removeFromCart(request);

      expect(mockCartService.removeItem).toHaveBeenCalledWith(userId, 'product-1', 'variant-1');
    });

    it('should return the updated cart response from service', async () => {
      mockCartService.removeItem.mockResolvedValue(mockCartResponse);

      const result = await controller.removeFromCart({ userId, productId: 'product-1' });

      expect(result).toEqual(mockCartResponse);
    });
  });

  describe('clearCart', () => {
    it('should call cartService.clearCart with userId', async () => {
      mockCartService.clearCart.mockResolvedValue({ success: true, message: 'Cart cleared successfully' });

      await controller.clearCart({ userId });

      expect(mockCartService.clearCart).toHaveBeenCalledWith(userId);
    });

    it('should return the status response from service', async () => {
      const statusResponse = { success: true, message: 'Cart cleared successfully' };
      mockCartService.clearCart.mockResolvedValue(statusResponse);

      const result = await controller.clearCart({ userId });

      expect(result).toEqual(statusResponse);
    });

    it('should propagate errors from service', async () => {
      mockCartService.clearCart.mockRejectedValue(AppError.internalServerError());

      await expect(controller.clearCart({ userId })).rejects.toBeInstanceOf(AppError);
    });
  });
});
