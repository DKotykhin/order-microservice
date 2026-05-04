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
import { AppError } from '../utils/errors/app-error';
import { mapOrder, GRPC_CURRENCY_TO_DB, GRPC_PRICE_TYPE_TO_DB, GRPC_STATUS_TO_DB } from './order.mappers';
import { OrderRepository } from './order.repository';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(private readonly orderRepository: OrderRepository) {}

  async createOrder(request: CreateOrderRequest): Promise<OrderResponse> {
    try {
      if (!request.items.length) throw AppError.badRequest('Order must contain at least one item');

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

      return mapOrder(order);
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
}
