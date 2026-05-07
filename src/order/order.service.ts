import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { DataSource } from 'typeorm';

import { Currencies, OrderStatus as DbOrderStatus, PriceType as DbPriceType } from '../database/db.enums';
import {
  type CancelOrderRequest,
  type CreateOrderRequest,
  type GetAllOrdersRequest,
  type GetOrdersByUserRequest,
  type OrderListResponse,
  type OrderResponse,
  type UpdateOrderStatusRequest,
} from '../generated-types/order';
import {
  Language,
  PriceType,
  STORE_ITEM_SERVICE_NAME,
  type StoreItemServiceClient,
  type StoreItemWithOption,
} from '../generated-types/store-item';
import { CartService } from '../cart/cart.service';
import { MessageBrokerService } from '../message-broker/message-broker.service';
import { OrderStatusHistoryService } from '../order-status-history/order-status-history.service';
import { RedisService } from '../redis/redis.service';
import { AppError } from '../utils/errors/app-error';
import { mapOrder, GRPC_CURRENCY_TO_DB, GRPC_PRICE_TYPE_TO_DB, GRPC_STATUS_TO_DB } from './order.mappers';
import { OrderRepository } from './order.repository';

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

const NOTIFIABLE_STATUSES = new Set([
  DbOrderStatus.SHIPPED,
  DbOrderStatus.DELIVERED,
  DbOrderStatus.CANCELLED,
  DbOrderStatus.REFUNDED,
]);

const STATUS_LABEL: Partial<Record<DbOrderStatus, string>> = {
  [DbOrderStatus.SHIPPED]: 'Shipped',
  [DbOrderStatus.DELIVERED]: 'Delivered',
  [DbOrderStatus.CANCELLED]: 'Cancelled',
  [DbOrderStatus.REFUNDED]: 'Refunded',
};

const STATUS_MESSAGE: Partial<Record<DbOrderStatus, string>> = {
  [DbOrderStatus.SHIPPED]: "Your order is on its way! You'll receive it soon.",
  [DbOrderStatus.DELIVERED]: 'Your order has been delivered. Enjoy your coffee!',
  [DbOrderStatus.CANCELLED]: 'Your order has been cancelled. If you have any questions, please contact support.',
  [DbOrderStatus.REFUNDED]: 'Your refund has been processed. It may take a few business days to appear.',
};

@Injectable()
export class OrderService implements OnModuleInit {
  private readonly logger = new Logger(OrderService.name);
  private storeItemClient: StoreItemServiceClient;

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly redisService: RedisService,
    private readonly messageBrokerService: MessageBrokerService,
    private readonly cartService: CartService,
    private readonly dataSource: DataSource,
    private readonly orderStatusHistoryService: OrderStatusHistoryService,
    @Inject(STORE_ITEM_SERVICE_NAME) private readonly storeItemGrpcClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.storeItemClient = this.storeItemGrpcClient.getService<StoreItemServiceClient>(STORE_ITEM_SERVICE_NAME);
  }

  async createOrder(request: CreateOrderRequest): Promise<OrderResponse> {
    try {
      if (!request.items.length) throw AppError.badRequest('Order must contain at least one item');
      this.logger.debug(`Idempotency key for this request: ${request.idempotencyKey}`);

      if (request.idempotencyKey) {
        const cached = await this.redisService.get(`idempotency:order:${request.idempotencyKey}`);
        if (cached) {
          const { userId, response } = JSON.parse(cached) as { userId: string; response: OrderResponse };
          if (userId !== request.userId) throw AppError.forbidden('Idempotency key does not belong to this user');
          this.logger.log(`Idempotent response for key ${request.idempotencyKey}, orderId: ${response.id}`);
          return response;
        }
      }

      const serverPrices = await Promise.all(
        request.items.map((item) => this.fetchServerPrice(item.productId, item.variantId)),
      );

      const validatedItems = request.items.map((item, i) => {
        const serverPrice = serverPrices[i];
        if (serverPrice !== item.unitPrice) {
          this.logger.warn(`Price drift on item ${item.productId}: client=${item.unitPrice}, server=${serverPrice}`);
        }
        return { ...item, unitPrice: serverPrice };
      });

      const totalPrice = validatedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const currency = GRPC_CURRENCY_TO_DB[validatedItems[0].currency] ?? Currencies.UAH;

      const order = await this.orderRepository.createWithItems(
        {
          userId: request.userId,
          status: DbOrderStatus.PENDING,
          currency,
          totalPrice,
          notes: request.notes ?? null,
        },
        validatedItems.map((input) => ({
          productId: input.productId,
          variantId: input.variantId ?? null,
          title: input.title,
          variantName: input.variantName ?? null,
          imageUrl: input.imageUrl ?? null,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          currency: GRPC_CURRENCY_TO_DB[input.currency] ?? Currencies.UAH,
          priceType: GRPC_PRICE_TYPE_TO_DB[input.priceType] ?? DbPriceType.REGULAR,
        })),
      );

      await this.orderStatusHistoryService.append({
        orderId: order.id,
        fromStatus: null,
        toStatus: DbOrderStatus.PENDING,
        changedBy: request.userId,
      });

      const response = mapOrder(order);

      await this.cartService.clearCart(request.userId);

      if (request.idempotencyKey) {
        await this.redisService.set(
          `idempotency:order:${request.idempotencyKey}`,
          JSON.stringify({ userId: request.userId, response }),
          'EX',
          IDEMPOTENCY_TTL_SECONDS,
        );
      }

      this.sendOrderConfirmationEmail(request.userId, response);

      return response;
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to create order for user ${request.userId}`, error);
      throw AppError.internalServerError('Failed to create order');
    }
  }

  async getOrder(id: string): Promise<OrderResponse> {
    try {
      const order = await this.orderRepository.findById(id);
      if (!order) throw AppError.notFound(`Order ${id} not found`);
      return mapOrder(order);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to get order ${id}`, error);
      throw AppError.internalServerError(`Failed to get order ${id}`);
    }
  }

  async getOrdersByUser(request: GetOrdersByUserRequest): Promise<OrderListResponse> {
    try {
      const { userId, page = 1, limit = 10, filters, sort } = request;
      const [orders, total] = await this.orderRepository.findByUser(userId, page, limit, filters, sort);
      return { orders: orders.map(mapOrder), total };
    } catch (error) {
      this.logger.error(`Failed to get orders for user ${request.userId}`, error);
      throw AppError.internalServerError(`Failed to get orders for user ${request.userId}`);
    }
  }

  async getAllOrders(request: GetAllOrdersRequest): Promise<OrderListResponse> {
    try {
      const { page = 1, limit = 10, filters, sort } = request;
      const [orders, total] = await this.orderRepository.findAll(page, limit, filters, sort);
      return { orders: orders.map(mapOrder), total };
    } catch (error) {
      this.logger.error('Failed to get all orders', error);
      throw AppError.internalServerError('Failed to get all orders');
    }
  }

  async updateOrderStatus(request: UpdateOrderStatusRequest): Promise<OrderResponse> {
    try {
      const order = await this.orderRepository.findById(request.id);
      if (!order) throw AppError.notFound(`Order ${request.id} not found`);

      const newStatus = GRPC_STATUS_TO_DB[request.status];
      if (!newStatus) throw AppError.badRequest(`Invalid order status: ${request.status}`);

      const fromStatus = order.status;
      await this.dataSource.transaction(async (manager) => {
        order.status = newStatus;
        await manager.save(order);
        await this.orderStatusHistoryService.append(
          { orderId: order.id, fromStatus, toStatus: newStatus, changedBy: 'system' },
          manager,
        );
      });
      if (NOTIFIABLE_STATUSES.has(newStatus)) {
        this.sendOrderStatusUpdateEmail(order.userId, order.id, newStatus);
      }
      return mapOrder(order);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to update status for order ${request.id}`, error);
      throw AppError.internalServerError('Failed to update order status');
    }
  }

  async cancelOrder(request: CancelOrderRequest): Promise<OrderResponse> {
    try {
      const order = await this.orderRepository.findById(request.id);
      if (!order) throw AppError.notFound(`Order ${request.id} not found`);
      if (order.userId !== request.userId) throw AppError.forbidden('You do not own this order');
      if (order.status !== DbOrderStatus.PENDING) {
        throw AppError.preconditionFailed('Only pending orders can be cancelled');
      }

      await this.dataSource.transaction(async (manager) => {
        order.status = DbOrderStatus.CANCELLED;
        await manager.save(order);
        await this.orderStatusHistoryService.append(
          {
            orderId: order.id,
            fromStatus: DbOrderStatus.PENDING,
            toStatus: DbOrderStatus.CANCELLED,
            changedBy: request.userId,
          },
          manager,
        );
      });
      this.sendOrderStatusUpdateEmail(order.userId, order.id, DbOrderStatus.CANCELLED);
      return mapOrder(order);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to cancel order ${request.id}`, error);
      throw AppError.internalServerError('Failed to cancel order');
    }
  }

  private async fetchServerPrice(productId: string, variantId?: string): Promise<number> {
    let storeItem: StoreItemWithOption;
    try {
      storeItem = await firstValueFrom(
        this.storeItemClient.getStoreItemById({ itemId: productId, language: Language.LANGUAGE_UNSPECIFIED }),
      );
    } catch (error) {
      const code = (error as { code?: number }).code;
      if (code === 5) throw AppError.preconditionFailed(`Item ${productId} is no longer available`);
      throw AppError.internalServerError(`Failed to validate price for item ${productId}`);
    }

    if (!storeItem?.id || !storeItem.isAvailable) {
      throw AppError.preconditionFailed(`Item ${productId} is no longer available`);
    }

    if (variantId) {
      const variant = storeItem.variants?.find((v) => v.id === variantId);
      if (!variant) throw AppError.preconditionFailed(`Variant ${variantId} not found for item ${productId}`);
      const raw = variant.discountPrice ?? variant.regularPrice;
      if (!raw) throw AppError.preconditionFailed(`No price configured for variant ${variantId}`);
      return parseFloat(raw);
    }

    const discountPrice = storeItem.prices?.find((p) => p.priceType === PriceType.PRICE_TYPE_DISCOUNT);
    const regularPrice = storeItem.prices?.find((p) => p.priceType === PriceType.PRICE_TYPE_REGULAR);
    const priceObj = discountPrice ?? regularPrice;
    if (!priceObj) {
      if (storeItem.variants?.length) {
        throw AppError.preconditionFailed(`Item ${productId} has only variant prices — variantId is required`);
      }
      throw AppError.preconditionFailed(`No price configured for item ${productId}`);
    }
    return parseFloat(priceObj.value);
  }

  private sendOrderStatusUpdateEmail(userId: string, orderId: string, newStatus: DbOrderStatus): void {
    this.messageBrokerService.emitMessage('notification.email.send', {
      userId,
      subject: `Order #${orderId.slice(0, 8).toUpperCase()} — ${STATUS_LABEL[newStatus]}`,
      template: 'order-status-update',
      context: {
        orderId,
        statusLabel: STATUS_LABEL[newStatus],
        statusMessage: STATUS_MESSAGE[newStatus],
        changedAt: new Date().toISOString(),
      },
    });
  }

  private sendOrderConfirmationEmail(userId: string, order: OrderResponse): void {
    const total = order.totalPrice.toFixed(2);
    this.messageBrokerService.emitMessage('notification.email.send', {
      userId,
      subject: `Order confirmed — #${order.id.slice(0, 8).toUpperCase()}`,
      template: 'order-confirmation',
      context: { orderId: order.id, items: order.items, total, currency: order.currency, createdAt: order.createdAt },
    });
  }
}
