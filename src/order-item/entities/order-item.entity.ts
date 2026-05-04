import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Currencies, PriceType } from '../../database/db.enums';
import { Order } from '../../order/entities/order.entity';

@Entity()
export class OrderItem extends BaseEntity {
  @Column()
  productId: string;

  @Column({ type: 'varchar', nullable: true })
  variantId: string | null;

  @Column({ type: 'varchar' })
  title: string;

  @Column({ type: 'varchar', nullable: true })
  variantName: string | null;

  @Column({ type: 'varchar', nullable: true })
  imageUrl: string | null;

  @Column('int')
  quantity: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ type: 'enum', enum: Currencies, default: Currencies.UAH })
  currency: Currencies;

  @Column({ type: 'enum', enum: PriceType, default: PriceType.REGULAR })
  priceType: PriceType;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;
}
