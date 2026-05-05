import { Injectable, Logger } from '@nestjs/common';

import { Currencies, OrderStatus as DbOrderStatus, PriceType as DbPriceType } from '../database/db.enums';
import {
  type CancelOrderRequest,
  type CreateOrderRequest,
  type GetOrdersByUserRequest,
  type OrderListResponse,
  type OrderResponse,
  type UpdateOrderStatusRequest,
} from '../generated-types/order';
import { MessageBrokerService } from '../message-broker/message-broker.service';
import { RedisService } from '../redis/redis.service';
import { AppError } from '../utils/errors/app-error';
import { mapOrder, GRPC_CURRENCY_TO_DB, GRPC_PRICE_TYPE_TO_DB, GRPC_STATUS_TO_DB } from './order.mappers';
import { OrderRepository } from './order.repository';

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly redisService: RedisService,
    private readonly messageBrokerService: MessageBrokerService,
  ) {}

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

      const totalPrice = request.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const currency = GRPC_CURRENCY_TO_DB[request.items[0].currency] ?? Currencies.UAH;

      const order = await this.orderRepository.createWithItems(
        {
          userId: request.userId,
          status: DbOrderStatus.PENDING,
          currency,
          totalPrice,
          notes: request.notes ?? null,
        },
        request.items.map((input) => ({
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

      const response = mapOrder(order);

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
      const { userId, page = 1, limit = 10 } = request;
      const [orders, total] = await this.orderRepository.findByUser(userId, page, limit);
      return { orders: orders.map(mapOrder), total };
    } catch (error) {
      this.logger.error(`Failed to get orders for user ${request.userId}`, error);
      throw AppError.internalServerError(`Failed to get orders for user ${request.userId}`);
    }
  }

  async updateOrderStatus(request: UpdateOrderStatusRequest): Promise<OrderResponse> {
    try {
      const order = await this.orderRepository.findById(request.id);
      if (!order) throw AppError.notFound(`Order ${request.id} not found`);

      const newStatus = GRPC_STATUS_TO_DB[request.status];
      if (!newStatus) throw AppError.badRequest(`Invalid order status: ${request.status}`);

      order.status = newStatus;
      await this.orderRepository.save(order);
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

      order.status = DbOrderStatus.CANCELLED;
      await this.orderRepository.save(order);
      return mapOrder(order);
    } catch (error) {
      if (error instanceof AppError) throw error;
      this.logger.error(`Failed to cancel order ${request.id}`, error);
      throw AppError.internalServerError('Failed to cancel order');
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
