import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import type { CartItem } from 'src/generated-types/cart';
import { MessageBrokerService } from 'src/message-broker/message-broker.service';
import { RedisService } from 'src/redis/redis.service';
import type { CartAbandonmentJobData } from './cart-abandonment-job.interface';
import { CART_ABANDONMENT_QUEUE } from './cart-abandonment.service';

const CART_KEY = (userId: string) => `cart:${userId}`;

const REMINDER_SUBJECTS = [
  'You left something in your cart',
  'Still thinking about it? Your cart is waiting',
  'Last chance — your cart expires soon',
];

@Processor(CART_ABANDONMENT_QUEUE)
export class CartAbandonmentProcessor extends WorkerHost {
  private readonly logger = new Logger(CartAbandonmentProcessor.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly messageBrokerService: MessageBrokerService,
  ) {
    super();
  }

  async process(job: Job<CartAbandonmentJobData>): Promise<void> {
    const { userId, reminderIndex } = job.data;

    const cartData = await this.redisService.hgetall(CART_KEY(userId));
    if (!cartData || Object.keys(cartData).length === 0) {
      this.logger.log(`Cart for user ${userId} is empty, skipping reminder ${reminderIndex}`);
      return;
    }

    const items = Object.values(cartData).map((v) => JSON.parse(v) as CartItem);
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const ttlSeconds = await this.redisService.ttl(CART_KEY(userId));
    const days = ttlSeconds > 0 ? Math.ceil(ttlSeconds / (60 * 60 * 24)) : 0;
    const cartExpiresInDays = `${days} ${days === 1 ? 'day' : 'days'}`;

    this.logger.debug(
      `Cart for user ${userId}: ${items.length} items, total $${total.toFixed(2)}, expires in ${cartExpiresInDays}`,
    );

    this.messageBrokerService.emitMessage('notification.email.send', {
      userId,
      subject: REMINDER_SUBJECTS[reminderIndex] ?? REMINDER_SUBJECTS[0],
      template: 'abandoned-cart',
      context: { items, total: total.toFixed(2), cartExpiresInDays },
    });

    this.logger.log(`Sent abandonment reminder ${reminderIndex} to user ${userId}`);
  }
}
