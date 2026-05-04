import 'reflect-metadata';
import { config } from 'dotenv';

config({ path: '.env.local' });

import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';

import { Order } from '../order/entities/order.entity';
import { OrderItem } from '../order-item/entities/order-item.entity';
import { Currencies, OrderStatus, PriceType } from './db.enums';

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [Order, OrderItem],
  synchronize: true,
  ssl: false,
});

async function seed() {
  await dataSource.initialize();

  const orderRepo = dataSource.getRepository(Order);
  const orderItemRepo = dataSource.getRepository(OrderItem);

  // Clear existing data (children first)
  await dataSource.query('TRUNCATE TABLE "order_item", "order" RESTART IDENTITY CASCADE');

  console.log('Cleared existing data.');

  // Generate IDs upfront so items can reference orders
  const order1Id = randomUUID();
  const order2Id = randomUUID();
  const order3Id = randomUUID();

  // ── 1. Orders ──
  await orderRepo.save([
    {
      id: order1Id,
      userId: 'user-001',
      status: OrderStatus.DELIVERED,
      currency: Currencies.UAH,
      totalPrice: 649,
      notes: null,
    },
    {
      id: order2Id,
      userId: 'user-002',
      status: OrderStatus.CONFIRMED,
      currency: Currencies.UAH,
      totalPrice: 1820,
      notes: 'Please leave at the door',
    },
    {
      id: order3Id,
      userId: 'user-001',
      status: OrderStatus.PENDING,
      currency: Currencies.UAH,
      totalPrice: 299,
      notes: null,
    },
  ]);

  // ── 2. Order Items ──
  await orderItemRepo.save([
    // Order 1 — Ethiopia 250g (discount) + Honduras Copan
    {
      order: { id: order1Id },
      productId: 'ethiopia-yirgacheffe',
      variantId: 'ia-ethiopia-weight-250g',
      title: 'Ethiopia Yirgacheffe',
      variantName: '250g',
      imageUrl: 'https://res.cloudinary.com/dlo66sher/image/upload/v1706304020/coffee/Ethiopia_Guji_af9kxq.jpg',
      quantity: 1,
      unitPrice: 299,
      currency: Currencies.UAH,
      priceType: PriceType.DISCOUNT,
    },
    {
      order: { id: order1Id },
      productId: 'honduras-copan',
      variantId: null,
      title: 'Honduras Copan',
      variantName: null,
      imageUrl: 'https://res.cloudinary.com/dlo66sher/image/upload/v1706304020/coffee/Honduras_Santa_Rosa_jyebm9.jpg',
      quantity: 1,
      unitPrice: 350,
      currency: Currencies.UAH,
      priceType: PriceType.DISCOUNT,
    },
    // Order 2 — Colombia 1kg (discount) × 1 + Hario V60
    {
      order: { id: order2Id },
      productId: 'colombia-supremo',
      variantId: 'ia-colombia-weight-1kg',
      title: 'Colombia Supremo',
      variantName: '1kg',
      imageUrl: 'https://res.cloudinary.com/dlo66sher/image/upload/v1706120761/coffee/Tanzania_Tamu_Yetu_izbkkh.webp',
      quantity: 1,
      unitPrice: 1380,
      currency: Currencies.UAH,
      priceType: PriceType.DISCOUNT,
    },
    {
      order: { id: order2Id },
      productId: 'hario-v60',
      variantId: null,
      title: 'Hario V60 Dripper',
      variantName: null,
      imageUrl: 'https://res.cloudinary.com/dlo66sher/image/upload/v1706304122/Tea/Orange_Ginger__c0y05d.jpg',
      quantity: 1,
      unitPrice: 1200,
      currency: Currencies.UAH,
      priceType: PriceType.REGULAR,
    },
    // Order 3 — Ethiopia 250g (discount) pending
    {
      order: { id: order3Id },
      productId: 'ethiopia-yirgacheffe',
      variantId: 'ia-ethiopia-weight-250g',
      title: 'Ethiopia Yirgacheffe',
      variantName: '250g',
      imageUrl: 'https://res.cloudinary.com/dlo66sher/image/upload/v1706304020/coffee/Ethiopia_Guji_af9kxq.jpg',
      quantity: 1,
      unitPrice: 299,
      currency: Currencies.UAH,
      priceType: PriceType.DISCOUNT,
    },
  ]);

  console.log('>>>> ✅ Seed complete! Check the database for seeded data. <<<<');
  await dataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
