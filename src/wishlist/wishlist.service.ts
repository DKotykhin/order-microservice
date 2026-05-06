import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

import { CartService } from 'src/cart/cart.service';
import { type CartItem, type CartItemInput, type CartResponse } from 'src/generated-types/cart';
import {
  Currency,
  Language,
  PriceType,
  STORE_ITEM_SERVICE_NAME,
  type StoreItemServiceClient,
  type StoreItemWithOption,
} from 'src/generated-types/store-item';
import { RedisService } from 'src/redis/redis.service';
import { AppError } from 'src/utils/errors/app-error';

const WISHLIST_KEY = (userId: string) => `wishlist:${userId}`;
const WISHLIST_ITEM_FIELD = (productId: string, variantId?: string) =>
  variantId ? `${productId}:${variantId}` : productId;
const CART_KEY = (userId: string) => `cart:${userId}`;
const WISHLIST_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

@Injectable()
export class WishlistService implements OnModuleInit {
  private readonly logger = new Logger(WishlistService.name);
  private storeItemClient: StoreItemServiceClient;

  constructor(
    private readonly redisService: RedisService,
    private readonly cartService: CartService,
    @Inject(STORE_ITEM_SERVICE_NAME) private readonly storeItemGrpcClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.storeItemClient = this.storeItemGrpcClient.getService<StoreItemServiceClient>(STORE_ITEM_SERVICE_NAME);
  }

  async getWishlist(userId: string): Promise<CartResponse> {
    try {
      await this.syncWithStore(userId);
      const response = await this.buildResponse(userId);
      if (response.items.length > 0) {
        await this.redisService.expire(WISHLIST_KEY(userId), WISHLIST_TTL_SECONDS);
      }
      return response;
    } catch (error) {
      this.logger.error(`Failed to get wishlist for user ${userId}`, error);
      throw AppError.internalServerError(`Failed to get wishlist for user ${userId}`);
    }
  }

  async addItem(userId: string, input: CartItemInput): Promise<CartResponse> {
    try {
      if (!input.productId) throw AppError.badRequest('productId is required');

      const field = WISHLIST_ITEM_FIELD(input.productId, input.variantId);
      const existing = await this.redisService.hget(WISHLIST_KEY(userId), field);
      if (existing) return this.buildResponse(userId);

      const storeItem = await this.fetchAndValidateStoreItem(input.productId);
      const { price, currency } = this.extractPrice(storeItem, input.variantId);
      const { title, variantName, imageUrl } = this.extractDisplayFields(storeItem, input.variantId);

      const item: CartItem = {
        productId: input.productId,
        variantId: input.variantId,
        quantity: 1,
        price,
        currency,
        title,
        variantName,
        imageUrl,
      };
      await this.redisService.hset(WISHLIST_KEY(userId), field, JSON.stringify(item));
      await this.redisService.expire(WISHLIST_KEY(userId), WISHLIST_TTL_SECONDS);

      return this.buildResponse(userId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to add item to wishlist for user ${userId}`, error);
      throw AppError.internalServerError(`Failed to add item to wishlist for user ${userId}`);
    }
  }

  async removeItem(userId: string, productId: string, variantId?: string): Promise<CartResponse> {
    try {
      await this.redisService.hdel(WISHLIST_KEY(userId), WISHLIST_ITEM_FIELD(productId, variantId));
      return this.buildResponse(userId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to remove item from wishlist for user ${userId}`, error);
      throw AppError.internalServerError(`Failed to remove item from wishlist for user ${userId}`);
    }
  }

  async moveToCart(userId: string, productId: string, variantId?: string): Promise<CartResponse> {
    try {
      const field = WISHLIST_ITEM_FIELD(productId, variantId);
      const raw = await this.redisService.hget(WISHLIST_KEY(userId), field);
      if (!raw) throw AppError.notFound(`Item ${productId} not found in wishlist`);

      const { quantity } = JSON.parse(raw) as CartItem;
      await this.redisService.hdel(WISHLIST_KEY(userId), field);
      await this.cartService.addItem(userId, { productId, variantId, quantity });

      return this.buildResponse(userId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to move item to cart for user ${userId}`, error);
      throw AppError.internalServerError(`Failed to move item to cart for user ${userId}`);
    }
  }

  async moveToWishlist(userId: string, productId: string, variantId?: string): Promise<CartResponse> {
    try {
      const cartField = WISHLIST_ITEM_FIELD(productId, variantId);
      const raw = await this.redisService.hget(CART_KEY(userId), cartField);
      if (!raw) throw AppError.notFound(`Item ${productId} not found in cart`);

      const cartItem = JSON.parse(raw) as CartItem;
      await this.redisService.hdel(CART_KEY(userId), cartField);

      const wishlistField = WISHLIST_ITEM_FIELD(productId, variantId);
      await this.redisService.hset(WISHLIST_KEY(userId), wishlistField, JSON.stringify(cartItem));
      await this.redisService.expire(WISHLIST_KEY(userId), WISHLIST_TTL_SECONDS);

      return this.buildResponse(userId);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to move item to wishlist for user ${userId}`, error);
      throw AppError.internalServerError(`Failed to move item to wishlist for user ${userId}`);
    }
  }

  private async fetchAndValidateStoreItem(productId: string): Promise<StoreItemWithOption> {
    let storeItem: StoreItemWithOption;
    try {
      storeItem = await firstValueFrom(
        this.storeItemClient.getStoreItemById({ itemId: productId, language: Language.LANGUAGE_UNSPECIFIED }),
      );
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 5) throw AppError.notFound(`Item ${productId} not found`);
      throw AppError.internalServerError(`Failed to fetch item ${productId} from store service`);
    }
    if (!storeItem?.id || !storeItem.isAvailable) {
      throw AppError.preconditionFailed(`Item ${productId} is not available`);
    }
    return storeItem;
  }

  private extractDisplayFields(
    storeItem: StoreItemWithOption,
    variantId?: string,
  ): { title: string; variantName?: string; imageUrl?: string } {
    const title = storeItem.title;
    const imageUrl = storeItem.images[0]?.url;
    let variantName: string | undefined;
    if (variantId) {
      const variant = storeItem.variants?.find((v) => v.id === variantId);
      if (variant) variantName = `${variant.attributeName}: ${variant.attributeValue}`;
    }
    return { title, variantName, imageUrl };
  }

  private extractPrice(storeItem: StoreItemWithOption, variantId?: string): { price: number; currency: Currency } {
    if (variantId) {
      const variant = storeItem.variants?.find((v) => v.id === variantId);
      if (!variant) throw AppError.notFound(`Variant ${variantId} not found for item ${storeItem.id}`);
      const raw = variant.discountPrice ?? variant.regularPrice;
      if (!raw) throw AppError.preconditionFailed(`No price configured for variant ${variantId}`);
      return { price: parseFloat(raw), currency: variant.currency ?? Currency.CURRENCY_UNSPECIFIED };
    }
    const discountPrice = storeItem.prices?.find((p) => p.priceType === PriceType.PRICE_TYPE_DISCOUNT);
    const regularPrice = storeItem.prices?.find((p) => p.priceType === PriceType.PRICE_TYPE_REGULAR);
    const priceObj = discountPrice ?? regularPrice;
    if (!priceObj) throw AppError.preconditionFailed(`No price configured for item ${storeItem.id}`);
    return { price: parseFloat(priceObj.value), currency: priceObj.currency ?? Currency.CURRENCY_UNSPECIFIED };
  }

  private async syncWithStore(userId: string): Promise<void> {
    const data = await this.redisService.hgetall(WISHLIST_KEY(userId));
    if (!data || Object.keys(data).length === 0) return;

    const entries = Object.entries(data).map(([field, raw]) => ({ field, item: JSON.parse(raw) as CartItem }));
    const productIds = [...new Set(entries.map((e) => e.item.productId))];

    const storeItems = new Map<string, StoreItemWithOption>();
    await Promise.all(
      productIds.map(async (productId) => {
        try {
          const storeItem = await firstValueFrom(
            this.storeItemClient.getStoreItemById({ itemId: productId, language: Language.LANGUAGE_UNSPECIFIED }),
          );
          if (storeItem?.id) storeItems.set(productId, storeItem);
        } catch {
          this.logger.warn(`Wishlist sync: could not fetch item ${productId}, keeping stored data`);
        }
      }),
    );

    for (const { field, item } of entries) {
      const storeItem = storeItems.get(item.productId);
      if (!storeItem) continue;

      if (!storeItem.isAvailable) {
        this.logger.log(`Wishlist sync: item ${item.productId} is no longer available, removing`);
        await this.redisService.hdel(WISHLIST_KEY(userId), field);
        continue;
      }

      try {
        const { price, currency } = this.extractPrice(storeItem, item.variantId);
        const { title, variantName, imageUrl } = this.extractDisplayFields(storeItem, item.variantId);
        const priceChanged = price !== item.price || currency !== item.currency;
        const displayChanged = title !== item.title || variantName !== item.variantName || imageUrl !== item.imageUrl;
        if (priceChanged || displayChanged) {
          if (priceChanged)
            this.logger.log(`Wishlist sync: price updated for item ${item.productId}: ${item.price} → ${price}`);
          await this.redisService.hset(
            WISHLIST_KEY(userId),
            field,
            JSON.stringify({ ...item, price, currency, title, variantName, imageUrl }),
          );
        }
      } catch {
        this.logger.warn(`Wishlist sync: could not extract price for item ${item.productId}, keeping stored data`);
      }
    }
  }

  private async buildResponse(userId: string): Promise<CartResponse> {
    const data = await this.redisService.hgetall(WISHLIST_KEY(userId));
    if (!data || Object.keys(data).length === 0) {
      return { userId, items: [], total: 0, currency: Currency.CURRENCY_UNSPECIFIED };
    }
    const items = Object.values(data).map((v) => JSON.parse(v) as CartItem);
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const currency = items[0]?.currency ?? Currency.CURRENCY_UNSPECIFIED;
    return { userId, items, total, currency };
  }
}
