import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config({ path: '.env.local' });

import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order-item/entities/order-item.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Order, OrderItem],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
