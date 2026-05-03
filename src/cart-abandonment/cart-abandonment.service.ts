import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import type { CartAbandonmentJobData } from './cart-abandonment-job.interface';

export const CART_ABANDONMENT_QUEUE = 'cart-abandonment';

const REMINDER_DELAYS_MS = [
  10 * 1000, // 10 seconds (for testing)
  1 * 60 * 60 * 1000, // 1 hour
  24 * 60 * 60 * 1000, // 24 hours
  72 * 60 * 60 * 1000, // 72 hours
];

@Injectable()
export class CartAbandonmentService {
  constructor(@InjectQueue(CART_ABANDONMENT_QUEUE) private readonly queue: Queue) {}

  async scheduleReminders(userId: string): Promise<void> {
    await this.cancelReminders(userId);

    for (let i = 0; i < REMINDER_DELAYS_MS.length; i++) {
      const data: CartAbandonmentJobData = { userId, reminderIndex: i };
      await this.queue.add('send-reminder', data, {
        jobId: `abandoned:${userId}:${i}`,
        delay: REMINDER_DELAYS_MS[i],
        removeOnComplete: true,
        removeOnFail: true,
      });
    }
  }

  async cancelReminders(userId: string): Promise<void> {
    for (let i = 0; i < REMINDER_DELAYS_MS.length; i++) {
      const job = await this.queue.getJob(`abandoned:${userId}:${i}`);
      await job?.remove();
    }
  }
}
