import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import { DataSource } from 'typeorm';

import { Currencies, OrderStatus as DbOrderStatus, PriceType as DbPriceType } from '../database/db.enums';
import type {
  RefundOrderRequest,
  CancelOrderRequest,
  CreateOrderRequest,
  GetAllOrdersRequest,
  GetOrdersByUserRequest,
  OrderListResponse,
  OrderResponse,
  UpdateOrderStatusRequest,
} from '../generated-types/order';
import {
  Language,
  PriceType,
  STORE_ITEM_SERVICE_NAME,
  type StoreItemServiceClient,
  type StoreItemWithOption,
} from '../generated-types/store-item';
import type { OrderItem } from '../order-item/entities/order-item.entity';
import { CartService } from '../cart/cart.service';
import { MessageBrokerService } from '../message-broker/message-broker.service';
import { OrderStatusHistoryService } from '../order-status-history/order-status-history.service';
import { RedisService } from '../redis/redis.service';
import { AppError } from '../utils/errors/app-error';
import { mapOrder, GRPC_CURRENCY_TO_DB, GRPC_PRICE_TYPE_TO_DB, GRPC_STATUS_TO_DB } from './order.mappers';
import { Order } from './entities/order.entity';
import { OrderRepository } from './order.repository';

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours
const REFUND_WINDOW_DAYS = 30;
const REFUND_WINDOW_MS = REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const SAGA_ACTOR = 'payment-saga';

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

type ReservableItem = { productId: string; variantId?: string | null; quantity: number };

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

  // ── Public API ────────────────────────────────────────────────────────────

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

      await this.reserveStock(validatedItems);

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
          { orderId: order.id, fromStatus, toStatus: newStatus, changedBy: request.changedBy, notes: request.notes },
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
      await this.performCancellation(order, request.userId);
      return mapOrder(order);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to cancel order ${request.id}`, error);
      throw AppError.internalServerError('Failed to cancel order');
    }
  }

  async refundOrder(request: RefundOrderRequest): Promise<OrderResponse> {
    try {
      const order = await this.orderRepository.findById(request.id);
      if (!order) throw AppError.notFound(`Order ${request.id} not found`);
      if (order.userId !== request.userId) throw AppError.forbidden('You do not own this order');
      if (order.status !== DbOrderStatus.DELIVERED) {
        throw AppError.preconditionFailed('Only delivered orders can be refunded');
      }

      const deliveredAt: Date | null = await this.orderStatusHistoryService.findDeliveredAt(order.id);
      if (!deliveredAt) throw AppError.internalServerError('Could not determine delivery date');
      if (Date.now() - deliveredAt.getTime() > REFUND_WINDOW_MS) {
        throw AppError.preconditionFailed(`Refund window of ${REFUND_WINDOW_DAYS} days has expired`);
      }

      await this.dataSource.transaction(async (manager) => {
        order.status = DbOrderStatus.REFUNDED;
        await manager.save(order);
        await this.orderStatusHistoryService.append(
          {
            orderId: order.id,
            fromStatus: DbOrderStatus.DELIVERED,
            toStatus: DbOrderStatus.REFUNDED,
            changedBy: request.userId,
            notes: request.reason ?? undefined,
          },
          manager,
        );
      });
      this.returnStockForOrder(order.items);
      this.sendOrderStatusUpdateEmail(order.userId, order.id, DbOrderStatus.REFUNDED);
      return mapOrder(order);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to refund order ${request.id}`, error);
      throw AppError.internalServerError('Failed to refund order');
    }
  }

  // ── Saga ──────────────────────────────────────────────────────────────────

  async confirmOrder(orderId: string): Promise<void> {
    try {
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        this.logger.warn(`confirmOrder: order ${orderId} not found`);
        return;
      }
      if (order.status !== DbOrderStatus.PENDING) {
        this.logger.warn(`confirmOrder: order ${orderId} is not PENDING (status=${order.status}), skipping`);
        return;
      }

      await this.dataSource.transaction(async (manager) => {
        order.status = DbOrderStatus.CONFIRMED;
        await manager.save(order);
        await this.orderStatusHistoryService.append(
          {
            orderId: order.id,
            fromStatus: DbOrderStatus.PENDING,
            toStatus: DbOrderStatus.CONFIRMED,
            changedBy: SAGA_ACTOR,
          },
          manager,
        );
      });
    } catch (error) {
      this.logger.error(`Failed to confirm order ${orderId}`, error);
      throw error;
    }
  }

  async cancelOrderBySaga(orderId: string, reason?: string): Promise<void> {
    try {
      const order = await this.orderRepository.findById(orderId);
      if (!order) {
        this.logger.warn(`cancelOrderBySaga: order ${orderId} not found`);
        return;
      }
      if (order.status !== DbOrderStatus.PENDING) {
        this.logger.warn(`cancelOrderBySaga: order ${orderId} is not PENDING (status=${order.status}), skipping`);
        return;
      }
      await this.performCancellation(order, SAGA_ACTOR, reason);
    } catch (error) {
      this.logger.error(`Failed to cancel order ${orderId} via saga`, error);
      throw error;
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private async performCancellation(order: Order, changedBy: string, reason?: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      order.status = DbOrderStatus.CANCELLED;
      await manager.save(order);
      await this.orderStatusHistoryService.append(
        {
          orderId: order.id,
          fromStatus: DbOrderStatus.PENDING,
          toStatus: DbOrderStatus.CANCELLED,
          changedBy,
          notes: reason,
        },
        manager,
      );
    });
    this.returnStockForOrder(order.items);
    this.sendOrderStatusUpdateEmail(order.userId, order.id, DbOrderStatus.CANCELLED);
  }

  private async reserveStock(items: ReservableItem[]): Promise<void> {
    const reservations: ReservableItem[] = [];
    for (const item of items) {
      const result = await firstValueFrom(
        this.storeItemClient.attemptReserveStock({
          itemId: item.productId,
          itemAttributeId: item.variantId ?? null,
          quantity: item.quantity,
        }),
      );

      if (result.stockTracked && !result.reserved) {
        await Promise.allSettled(
          reservations.map((r) =>
            firstValueFrom(
              this.storeItemClient.returnStock({
                itemId: r.productId,
                itemAttributeId: r.variantId ?? null,
                quantity: r.quantity,
              }),
            ),
          ),
        );
        throw AppError.preconditionFailed(`Insufficient stock for item ${item.productId}`);
      }

      if (result.stockTracked) reservations.push(item);
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

  private returnStockForOrder(items: OrderItem[]): void {
    for (const item of items) {
      firstValueFrom(
        this.storeItemClient.returnStock({
          itemId: item.productId,
          itemAttributeId: item.variantId ?? null,
          quantity: item.quantity,
        }),
      ).catch((err: unknown) =>
        this.logger.error(
          `Failed to return stock for item ${item.productId}: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
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
