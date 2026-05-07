import { of, throwError } from 'rxjs';

import type { CartItem, CartItemInput } from 'src/generated-types/cart';
import { PriceType, type StoreItemWithOption } from 'src/generated-types/store-item';
import type { RedisService } from 'src/redis/redis.service';
import { AppError } from 'src/utils/errors/app-error';

import { CartService } from '../cart.service';
import { Currency } from 'src/generated-types/order';

const mockRedisService = {
  hgetall: jest.fn(),
  hget: jest.fn(),
  hset: jest.fn(),
  hdel: jest.fn(),
  expire: jest.fn(),
  del: jest.fn(),
};

const mockStoreItemClient = {
  getStoreItemById: jest.fn(),
};

const mockGrpcClient = {
  getService: jest.fn(),
};

const mockCartAbandonmentService = {
  scheduleReminders: jest.fn().mockResolvedValue(undefined),
  cancelReminders: jest.fn().mockResolvedValue(undefined),
};

const mockStoreItem: StoreItemWithOption = {
  id: 'product-1',
  slug: 'product-1',
  isAvailable: true,
  sortOrder: 1,
  categoryId: 'category-1',
  title: 'Product 1',
  images: [],
  variants: [],
  attributes: [],
  prices: [{ id: 'price-1', priceType: PriceType.PRICE_TYPE_REGULAR, value: '10.00', currency: Currency.CURRENCY_USD }],
};

const userId = 'user-123';
const cartKey = `cart:${userId}`;
const CART_TTL_SECONDS = 7 * 24 * 60 * 60;

// Client-supplied input — no price/currency
const mockInputItem: CartItemInput = {
  productId: 'product-1',
  quantity: 2,
  variantId: undefined,
};

// Server-enriched item as stored in Redis and returned in responses
const mockStoredItem: CartItem = {
  productId: 'product-1',
  quantity: 2,
  variantId: undefined,
  price: 10.0,
  currency: Currency.CURRENCY_USD,
  title: 'Product 1',
  variantName: undefined,
  imageUrl: undefined,
};

describe('CartService', () => {
  let service: CartService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreItemClient.getStoreItemById.mockReturnValue(of(mockStoreItem));
    mockGrpcClient.getService.mockReturnValue(mockStoreItemClient);
    service = new CartService(
      mockRedisService as unknown as RedisService,
      mockCartAbandonmentService as never,
      mockGrpcClient as never,
    );
    service.onModuleInit();
  });

  describe('getCart', () => {
    it('should return empty cart when no data in Redis', async () => {
      mockRedisService.hgetall.mockResolvedValue({});

      const result = await service.getCart(userId);

      expect(result).toEqual({ userId, items: [], total: 0, currency: Currency.CURRENCY_UNSPECIFIED });
    });

    it('should return cart with items and computed total', async () => {
      mockRedisService.hgetall.mockResolvedValue({
        'product-1': JSON.stringify(mockStoredItem),
      });
      mockRedisService.expire.mockResolvedValue(1);

      const result = await service.getCart(userId);

      expect(result.userId).toBe(userId);
      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(20.0); // 10.0 * 2
      expect(result.currency).toBe(Currency.CURRENCY_USD);
    });

    it('should extend TTL when cart has items', async () => {
      mockRedisService.hgetall.mockResolvedValue({
        'product-1': JSON.stringify(mockStoredItem),
      });
      mockRedisService.expire.mockResolvedValue(1);

      await service.getCart(userId);

      expect(mockRedisService.expire).toHaveBeenCalledWith(cartKey, CART_TTL_SECONDS);
    });

    it('should not extend TTL when cart is empty', async () => {
      mockRedisService.hgetall.mockResolvedValue({});

      await service.getCart(userId);

      expect(mockRedisService.expire).not.toHaveBeenCalled();
    });

    it('should throw AppError when Redis fails', async () => {
      mockRedisService.hgetall.mockRejectedValue(new Error('Redis error'));

      await expect(service.getCart(userId)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('addItem', () => {
    it('should store new item with server-fetched price and display fields', async () => {
      mockRedisService.hget.mockResolvedValue(null);
      mockRedisService.hset.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({ 'product-1': JSON.stringify(mockStoredItem) });

      await service.addItem(userId, mockInputItem);

      expect(mockRedisService.hset).toHaveBeenCalledWith(cartKey, 'product-1', JSON.stringify(mockStoredItem));
    });

    it('should increment quantity when item already exists', async () => {
      const existing: CartItem = { ...mockStoredItem, quantity: 1 };
      mockRedisService.hget.mockResolvedValue(JSON.stringify(existing));
      mockRedisService.hset.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({});

      await service.addItem(userId, { ...mockInputItem, quantity: 2 });

      expect(mockRedisService.hset).toHaveBeenCalledWith(
        cartKey,
        'product-1',
        JSON.stringify({ ...existing, quantity: 3 }),
      );
    });

    it('should use productId:variantId as field key when variantId is present', async () => {
      const variant = {
        id: 'variant-1',
        attributeSlug: 's',
        attributeName: 'Size',
        attributeValue: 'M',
        regularPrice: '15.00',
        currency: Currency.CURRENCY_USD,
      };
      mockStoreItemClient.getStoreItemById.mockReturnValue(of({ ...mockStoreItem, variants: [variant], prices: [] }));
      const itemWithVariant: CartItemInput = { ...mockInputItem, variantId: 'variant-1' };
      mockRedisService.hget.mockResolvedValue(null);
      mockRedisService.hset.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({});

      await service.addItem(userId, itemWithVariant);

      expect(mockRedisService.hget).toHaveBeenCalledWith(cartKey, 'product-1:variant-1');
    });

    it('should refresh TTL after adding item', async () => {
      mockRedisService.hget.mockResolvedValue(null);
      mockRedisService.hset.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({});

      await service.addItem(userId, mockInputItem);

      expect(mockRedisService.expire).toHaveBeenCalledWith(cartKey, CART_TTL_SECONDS);
    });

    it('should schedule abandonment reminders after adding item', async () => {
      mockRedisService.hget.mockResolvedValue(null);
      mockRedisService.hset.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({});

      await service.addItem(userId, mockInputItem);

      expect(mockCartAbandonmentService.scheduleReminders).toHaveBeenCalledWith(userId);
    });

    it('should throw badRequest when productId is empty', async () => {
      await expect(service.addItem(userId, { ...mockInputItem, productId: '' })).rejects.toBeInstanceOf(AppError);
    });

    it('should throw badRequest when quantity is 0', async () => {
      await expect(service.addItem(userId, { ...mockInputItem, quantity: 0 })).rejects.toBeInstanceOf(AppError);
    });

    it('should throw notFound when store item does not exist (null response)', async () => {
      mockStoreItemClient.getStoreItemById.mockReturnValue(of(null));

      await expect(service.addItem(userId, mockInputItem)).rejects.toBeInstanceOf(AppError);
    });

    it('should throw notFound when store service returns gRPC NOT_FOUND', async () => {
      const grpcError = Object.assign(new Error('not found'), { code: 5 });
      mockStoreItemClient.getStoreItemById.mockReturnValue(throwError(() => grpcError));

      await expect(service.addItem(userId, mockInputItem)).rejects.toBeInstanceOf(AppError);
    });

    it('should throw notFound when store service returns gRPC INTERNAL null-serialization error', async () => {
      const grpcError = Object.assign(new Error('Error serializing response: Cannot read properties of null'), {
        code: 13,
      });
      mockStoreItemClient.getStoreItemById.mockReturnValue(throwError(() => grpcError));

      await expect(service.addItem(userId, mockInputItem)).rejects.toBeInstanceOf(AppError);
    });

    it('should throw preconditionFailed when item is not available in store', async () => {
      mockStoreItemClient.getStoreItemById.mockReturnValue(of({ ...mockStoreItem, isAvailable: false }));

      await expect(service.addItem(userId, mockInputItem)).rejects.toBeInstanceOf(AppError);
    });

    it('should throw AppError when store service fails', async () => {
      mockStoreItemClient.getStoreItemById.mockReturnValue(of(mockStoreItem));
      mockRedisService.hget.mockRejectedValue(new Error('Redis error'));

      await expect(service.addItem(userId, mockInputItem)).rejects.toBeInstanceOf(AppError);
    });
  });

  describe('updateItem', () => {
    it('should throw badRequest when quantity is negative', async () => {
      await expect(service.updateItem(userId, { ...mockInputItem, quantity: -1 })).rejects.toBeInstanceOf(AppError);
    });

    it('should throw AppError notFound when item does not exist', async () => {
      mockRedisService.hget.mockResolvedValue(null);

      await expect(service.updateItem(userId, mockInputItem)).rejects.toBeInstanceOf(AppError);
    });

    it('should set exact quantity when item exists', async () => {
      mockRedisService.hget.mockResolvedValue(JSON.stringify(mockStoredItem));
      mockRedisService.hset.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({});

      await service.updateItem(userId, { ...mockInputItem, quantity: 5 });

      expect(mockRedisService.hset).toHaveBeenCalledWith(
        cartKey,
        'product-1',
        JSON.stringify({ ...mockStoredItem, quantity: 5 }),
      );
    });

    it('should remove item when quantity is set to 0', async () => {
      mockRedisService.hget.mockResolvedValue(JSON.stringify(mockStoredItem));
      mockRedisService.hdel.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({});

      await service.updateItem(userId, { ...mockInputItem, quantity: 0 });

      expect(mockRedisService.hdel).toHaveBeenCalledWith(cartKey, 'product-1');
      expect(mockRedisService.hset).not.toHaveBeenCalled();
    });

    it('should cancel reminders when cart becomes empty after update', async () => {
      mockRedisService.hget.mockResolvedValue(JSON.stringify(mockStoredItem));
      mockRedisService.hdel.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({});

      await service.updateItem(userId, { ...mockInputItem, quantity: 0 });

      expect(mockCartAbandonmentService.cancelReminders).toHaveBeenCalledWith(userId);
    });

    it('should reschedule reminders when cart still has items after update', async () => {
      mockRedisService.hget.mockResolvedValue(JSON.stringify(mockStoredItem));
      mockRedisService.hset.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({ 'product-1': JSON.stringify(mockStoredItem) });

      await service.updateItem(userId, { ...mockInputItem, quantity: 5 });

      expect(mockCartAbandonmentService.scheduleReminders).toHaveBeenCalledWith(userId);
    });

    it('should re-throw AppError without wrapping it', async () => {
      mockRedisService.hget.mockResolvedValue(null);

      const error = await service.updateItem(userId, mockInputItem).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
    });
  });

  describe('removeItem', () => {
    it('should remove item by productId', async () => {
      mockRedisService.hdel.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({});

      await service.removeItem(userId, 'product-1');

      expect(mockRedisService.hdel).toHaveBeenCalledWith(cartKey, 'product-1');
    });

    it('should use productId:variantId as field key when variantId is present', async () => {
      mockRedisService.hdel.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({});

      await service.removeItem(userId, 'product-1', 'variant-1');

      expect(mockRedisService.hdel).toHaveBeenCalledWith(cartKey, 'product-1:variant-1');
    });

    it('should cancel reminders when cart becomes empty after removal', async () => {
      mockRedisService.hdel.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({});

      await service.removeItem(userId, 'product-1');

      expect(mockCartAbandonmentService.cancelReminders).toHaveBeenCalledWith(userId);
    });

    it('should reschedule reminders when cart still has items after removal', async () => {
      mockRedisService.hdel.mockResolvedValue(1);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({
        'product-2': JSON.stringify({ ...mockStoredItem, productId: 'product-2' }),
      });

      await service.removeItem(userId, 'product-1');

      expect(mockCartAbandonmentService.scheduleReminders).toHaveBeenCalledWith(userId);
    });

    it('should be idempotent when item does not exist', async () => {
      mockRedisService.hdel.mockResolvedValue(0);
      mockRedisService.expire.mockResolvedValue(1);
      mockRedisService.hgetall.mockResolvedValue({});

      await expect(service.removeItem(userId, 'product-1')).resolves.not.toThrow();
    });
  });

  describe('clearCart', () => {
    it('should delete the cart key from Redis', async () => {
      mockRedisService.del.mockResolvedValue(1);

      await service.clearCart(userId);

      expect(mockRedisService.del).toHaveBeenCalledWith(cartKey);
    });

    it('should cancel abandonment reminders on clear', async () => {
      mockRedisService.del.mockResolvedValue(1);

      await service.clearCart(userId);

      expect(mockCartAbandonmentService.cancelReminders).toHaveBeenCalledWith(userId);
    });

    it('should return success response', async () => {
      mockRedisService.del.mockResolvedValue(1);

      const result = await service.clearCart(userId);

      expect(result).toEqual({ success: true, message: 'Cart cleared successfully' });
    });

    it('should throw AppError when Redis fails', async () => {
      mockRedisService.del.mockRejectedValue(new Error('Redis error'));

      await expect(service.clearCart(userId)).rejects.toBeInstanceOf(AppError);
    });
  });
});
