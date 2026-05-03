import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { Job } from 'bullmq';
import { firstValueFrom } from 'rxjs';

import type { CartItem } from 'src/generated-types/cart';
import { USER_SERVICE_NAME, type UserServiceClient } from 'src/generated-types/user';
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
export class CartAbandonmentProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(CartAbandonmentProcessor.name);
  private userServiceClient: UserServiceClient;

  constructor(
    private readonly redisService: RedisService,
    private readonly messageBrokerService: MessageBrokerService,
    @Inject(USER_SERVICE_NAME) private readonly userMicroserviceClient: ClientGrpc,
  ) {
    super();
  }

  onModuleInit() {
    this.userServiceClient = this.userMicroserviceClient.getService<UserServiceClient>(USER_SERVICE_NAME);
  }

  async process(job: Job<CartAbandonmentJobData>): Promise<void> {
    const { userId, reminderIndex } = job.data;

    const cartData = await this.redisService.hgetall(CART_KEY(userId));
    if (!cartData || Object.keys(cartData).length === 0) {
      this.logger.log(`Cart for user ${userId} is empty, skipping reminder ${reminderIndex}`);
      return;
    }

    let userEmail: string;
    try {
      const user = await firstValueFrom(this.userServiceClient.getUserById({ id: userId }));
      userEmail = user.email;
    } catch (error) {
      this.logger.error(`Failed to fetch email for user ${userId}`, error);
      return;
    }

    const items = Object.values(cartData).map((v) => JSON.parse(v) as CartItem);
    const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    this.logger.debug(
      `Cart for user ${userEmail}: ${items.length} items, total $${total.toFixed(2)}, items: ${JSON.stringify(items)}`,
    );

    this.messageBrokerService.emitMessage('notification.email.send', {
      to: userEmail,
      subject: REMINDER_SUBJECTS[reminderIndex] ?? REMINDER_SUBJECTS[0],
      template: 'abandoned-cart',
      context: { items, total: total.toFixed(2) },
    });

    this.logger.log(`Sent abandonment reminder ${reminderIndex} to user ${userId}`);
  }
}
