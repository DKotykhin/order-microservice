import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import {
  Currency,
  type CartItem,
  type CartItemInput,
  type CartResponse,
  type StatusResponse,
} from 'src/generated-types/cart';
import {
  Language,
  PriceType,
  STORE_ITEM_SERVICE_NAME,
  type StoreItemServiceClient,
  type StoreItemWithOption,
} from 'src/generated-types/store-item';
import { RedisService } from 'src/redis/redis.service';
import { AppError } from 'src/utils/errors/app-error';

const CART_KEY = (userId: string) => `cart:${userId}`;
const CART_ITEM_FIELD = (productId: string, variantId?: string) =>
  variantId ? `${productId}:${variantId}` : productId;
const CART_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

@Injectable()
export class CartService implements OnModuleInit {
  private readonly logger = new Logger(CartService.name);
  private storeItemClient: StoreItemServiceClient;

  constructor(
    private readonly redisService: RedisService,
    @Inject(STORE_ITEM_SERVICE_NAME) private readonly storeItemMicroserviceClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.storeItemClient = this.storeItemMicroserviceClient.getService<StoreItemServiceClient>(STORE_ITEM_SERVICE_NAME);
  }

  async getCart(userId: string): Promise<CartResponse> {
    try {
      return await this.buildCartResponse(userId);
    } catch (error) {
      this.logger.error(`Failed to get cart for user ${userId}`, error);
      throw AppError.internalServerError(`Failed to get cart for user ${userId}`);
    }
  }

  async addItem(userId: string, input: CartItemInput): Promise<CartResponse> {
    try {
      const { productId, variantId, quantity } = input;
      this.validateItemInput({ productId, variantId, quantity });

      const storeItem = await this.fetchAndValidateStoreItem(productId);
      const { price, currency } = this.extractPrice(storeItem, variantId);
      const enrichedItem: CartItem = { productId, variantId, quantity, price, currency };

      const field = CART_ITEM_FIELD(productId, variantId);
      const existing = await this.redisService.hget(CART_KEY(userId), field);

      const existingItem = existing ? (JSON.parse(existing) as CartItem) : null;
      const itemToStore: CartItem = existingItem
        ? { ...existingItem, quantity: existingItem.quantity + enrichedItem.quantity }
        : enrichedItem;

      await this.redisService.hset(CART_KEY(userId), field, JSON.stringify(itemToStore));
      await this.redisService.expire(CART_KEY(userId), CART_TTL_SECONDS);

      return this.buildCartResponse(userId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to add item to cart for user ${userId}`, error);
      throw AppError.internalServerError(`Failed to add item to cart for user ${userId}`);
    }
  }

  async updateItem(userId: string, item: CartItemInput): Promise<CartResponse> {
    try {
      if (!item.productId) throw AppError.badRequest('productId is required');
      if (item.quantity < 0) throw AppError.badRequest('quantity must not be negative');

      const field = CART_ITEM_FIELD(item.productId, item.variantId);
      const existing = await this.redisService.hget(CART_KEY(userId), field);

      if (!existing) {
        throw AppError.notFound(`Item ${item.productId} not found in cart`);
      }

      if (item.quantity <= 0) {
        await this.redisService.hdel(CART_KEY(userId), field);
      } else {
        const updatedItem: CartItem = { ...(JSON.parse(existing) as CartItem), quantity: item.quantity };
        await this.redisService.hset(CART_KEY(userId), field, JSON.stringify(updatedItem));
      }

      await this.redisService.expire(CART_KEY(userId), CART_TTL_SECONDS);

      return this.buildCartResponse(userId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to update item in cart for user ${userId}`, error);
      throw AppError.internalServerError(`Failed to update item in cart for user ${userId}`);
    }
  }

  async removeItem(userId: string, productId: string, variantId?: string): Promise<CartResponse> {
    try {
      const field = CART_ITEM_FIELD(productId, variantId);

      await this.redisService.hdel(CART_KEY(userId), field);
      await this.redisService.expire(CART_KEY(userId), CART_TTL_SECONDS);

      return this.buildCartResponse(userId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to remove item from cart for user ${userId}`, error);
      throw AppError.internalServerError(`Failed to remove item from cart for user ${userId}`);
    }
  }

  async clearCart(userId: string): Promise<StatusResponse> {
    try {
      await this.redisService.del(CART_KEY(userId));
      return { success: true, message: 'Cart cleared successfully' };
    } catch (error) {
      this.logger.error(`Failed to clear cart for user ${userId}`, error);
      throw AppError.internalServerError(`Failed to clear cart for user ${userId}`);
    }
  }

  private validateItemInput(item: CartItemInput): void {
    if (!item.productId) throw AppError.badRequest('productId is required');
    if (item.quantity <= 0) throw AppError.badRequest('quantity must be greater than 0');
  }

  private async fetchAndValidateStoreItem(productId: string): Promise<StoreItemWithOption> {
    let storeItem: StoreItemWithOption;

    try {
      storeItem = await firstValueFrom(
        this.storeItemClient.getStoreItemById({ itemId: productId, language: Language.LANGUAGE_UNSPECIFIED }),
      );
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 5) {
        this.logger.warn(`Item ${productId} not found in store service`);
        throw AppError.notFound(`Item ${productId} not found`);
      } else {
        this.logger.error(`Failed to fetch item ${productId} from store service`);
        throw AppError.internalServerError(`Failed to fetch item ${productId} from store service`);
      }
    }

    if (!storeItem?.id) {
      throw AppError.notFound(`Item ${productId} not found`);
    }

    if (!storeItem.isAvailable) {
      throw AppError.preconditionFailed(`Item ${productId} is not available`);
    }

    return storeItem;
  }

  private extractPrice(storeItem: StoreItemWithOption, variantId?: string): { price: number; currency: Currency } {
    if (variantId) {
      const variant = storeItem.variants.find((v) => v.id === variantId);
      if (!variant) throw AppError.notFound(`Variant ${variantId} not found for item ${storeItem.id}`);

      const rawPrice = variant.discountPrice ?? variant.regularPrice;
      if (!rawPrice) throw AppError.preconditionFailed(`No price configured for variant ${variantId}`);

      return {
        price: parseFloat(rawPrice),
        currency: variant.currency ?? Currency.CURRENCY_UNSPECIFIED,
      };
    }

    const discountPrice = storeItem.prices.find((p) => p.priceType === PriceType.PRICE_TYPE_DISCOUNT);
    const regularPrice = storeItem.prices.find((p) => p.priceType === PriceType.PRICE_TYPE_REGULAR);
    const priceObj = discountPrice ?? regularPrice;

    if (!priceObj) throw AppError.preconditionFailed(`No price configured for item ${storeItem.id}`);

    return {
      price: parseFloat(priceObj.value),
      currency: priceObj.currency ?? Currency.CURRENCY_UNSPECIFIED,
    };
  }

  private async buildCartResponse(userId: string): Promise<CartResponse> {
    const data = await this.redisService.hgetall(CART_KEY(userId));

    if (!data || Object.keys(data).length === 0) {
      return { userId, items: [], total: 0, currency: Currency.CURRENCY_UNSPECIFIED };
    }

    const items = Object.values(data).map((v) => JSON.parse(v) as CartItem);
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const currency = items[0]?.currency ?? Currency.CURRENCY_UNSPECIFIED;

    return { userId, items, total, currency };
  }
}
