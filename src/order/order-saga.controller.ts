import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';

import { RmqConsumerService } from '../rmq-consumer/rmq-consumer.service';
import { OrderService } from './order.service';

interface PaymentSucceededPayload {
  orderId: string;
  paymentId: string;
  userId: string;
  amount: number;
  currency: string;
}

interface PaymentFailedPayload {
  orderId: string;
  paymentId: string;
  userId: string;
  reason?: string;
}

@Controller()
export class OrderSagaController {
  private readonly logger = new Logger(OrderSagaController.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly rmqService: RmqConsumerService,
  ) {}

  @EventPattern('payment.succeeded')
  async onPaymentSucceeded(@Payload() payload: PaymentSucceededPayload, @Ctx() context: RmqContext): Promise<void> {
    const event = 'payment.succeeded';
    this.logger.log(`Received ${event} for order ${payload.orderId}`);
    try {
      await this.orderService.confirmOrder(payload.orderId);
      this.rmqService.ackMessage(context, event);
    } catch (error) {
      this.logger.error(`Failed to confirm order ${payload.orderId}`, error);
      this.rmqService.nackMessage(context, event, false);
    }
  }

  @EventPattern('payment.failed')
  async onPaymentFailed(@Payload() payload: PaymentFailedPayload, @Ctx() context: RmqContext): Promise<void> {
    const event = 'payment.failed';
    this.logger.log(`Received ${event} for order ${payload.orderId}`);
    try {
      await this.orderService.cancelOrderBySaga(payload.orderId, payload.reason);
      this.rmqService.ackMessage(context, event);
    } catch (error) {
      this.logger.error(`Failed to cancel order ${payload.orderId} via saga`, error);
      this.rmqService.nackMessage(context, event, false);
    }
  }
}
