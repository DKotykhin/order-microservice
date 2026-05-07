import { Controller, Logger } from '@nestjs/common';

import {
  OrderServiceControllerMethods,
  type CancelOrderRequest,
  type CreateOrderRequest,
  type GetAllOrdersRequest,
  type GetOrdersByUserRequest,
  type OrderId,
  type OrderListResponse,
  type OrderResponse,
  type OrderServiceController,
  type OrderStatusHistoryResponse,
  type RefundOrderRequest,
  type UpdateOrderStatusRequest,
} from '../generated-types/order';
import { OrderStatusHistoryService } from '../order-status-history/order-status-history.service';
import { OrderService } from './order.service';

@Controller()
@OrderServiceControllerMethods()
export class OrderController implements OrderServiceController {
  private readonly logger = new Logger(OrderController.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly orderStatusHistoryService: OrderStatusHistoryService,
  ) {}

  async createOrder(request: CreateOrderRequest): Promise<OrderResponse> {
    this.logger.log(`CreateOrder for userId: ${request.userId}, items: ${request.items.length}`);
    return this.orderService.createOrder(request);
  }

  async getOrder(request: OrderId): Promise<OrderResponse> {
    this.logger.log(`GetOrder id: ${request.id}`);
    return this.orderService.getOrder(request.id);
  }

  async getOrdersByUser(request: GetOrdersByUserRequest): Promise<OrderListResponse> {
    this.logger.log(`GetOrdersByUser userId: ${request.userId}, page: ${request.page}, limit: ${request.limit}`);
    return this.orderService.getOrdersByUser(request);
  }

  // TODO: enforce admin role check via gRPC metadata before this reaches the service
  async getAllOrders(request: GetAllOrdersRequest): Promise<OrderListResponse> {
    this.logger.log(`GetAllOrders page: ${request.page}, limit: ${request.limit}`);
    return this.orderService.getAllOrders(request);
  }

  async updateOrderStatus(request: UpdateOrderStatusRequest): Promise<OrderResponse> {
    this.logger.log(`UpdateOrderStatus id: ${request.id}, status: ${request.status}`);
    return this.orderService.updateOrderStatus(request);
  }

  async cancelOrder(request: CancelOrderRequest): Promise<OrderResponse> {
    this.logger.log(`CancelOrder id: ${request.id}, userId: ${request.userId}`);
    return this.orderService.cancelOrder(request);
  }

  async getOrderStatusHistory(request: OrderId): Promise<OrderStatusHistoryResponse> {
    this.logger.log(`GetOrderStatusHistory id: ${request.id}`);
    return this.orderStatusHistoryService.findByOrderId(request.id);
  }

  async refundOrder(request: RefundOrderRequest): Promise<OrderResponse> {
    this.logger.log(`RefundOrder id: ${request.id}, userId: ${request.userId}, reason: ${request.reason}`);
    return this.orderService.refundOrder(request);
  }
}
