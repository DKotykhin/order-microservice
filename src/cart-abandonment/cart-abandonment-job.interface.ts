export interface CartAbandonmentJobData {
  userId: string;
  reminderIndex: number; // 0 = 1h, 1 = 24h, 2 = 72h
}
