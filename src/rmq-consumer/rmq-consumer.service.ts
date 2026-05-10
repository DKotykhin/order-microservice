import { Injectable, Logger } from '@nestjs/common';
import { RmqContext } from '@nestjs/microservices';
import { Channel, ConsumeMessage } from 'amqplib';

@Injectable()
export class RmqConsumerService {
  private readonly logger = new Logger(RmqConsumerService.name);

  ackMessage(context: RmqContext, event?: string): void {
    const channel = context.getChannelRef() as Channel;
    const message = context.getMessage() as ConsumeMessage;
    if (!message?.fields.deliveryTag) {
      this.logger.error('Delivery tag missing, cannot ack message');
      return;
    }
    channel.ack(message);
    this.logger.log(`Acked message for event: ${event ?? 'unknown'}`);
  }

  nackMessage(context: RmqContext, event?: string, requeue = false): void {
    const channel = context.getChannelRef() as Channel;
    const message = context.getMessage() as ConsumeMessage;
    if (!message?.fields.deliveryTag) {
      this.logger.error('Delivery tag missing, cannot nack message');
      return;
    }
    channel.nack(message, false, requeue);
    this.logger.warn(`Nacked message for event: ${event ?? 'unknown'} (requeue=${requeue})`);
  }
}
