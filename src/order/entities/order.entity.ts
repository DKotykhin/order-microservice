import { Column, Entity, OneToMany } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Currencies, OrderStatus } from '../../database/db.enums';
import { OrderItem } from '../../order-item/entities/order-item.entity';

@Entity()
export class Order extends BaseEntity {
  @Column()
  userId: string;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column({ type: 'enum', enum: Currencies, default: Currencies.UAH })
  currency: Currencies;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  totalPrice: number;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => OrderItem, (orderItem) => orderItem.order, { cascade: true })
  items: OrderItem[];
}
