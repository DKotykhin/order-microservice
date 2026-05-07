import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { OrderStatus } from '../../database/db.enums';
import { Order } from '../../order/entities/order.entity';

@Entity('order_status_history')
@Index(['orderId'])
@Index(['changedAt'])
export class OrderStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'order_id' })
  orderId: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'from_status', type: 'enum', enum: OrderStatus, nullable: true })
  fromStatus: OrderStatus | null; // null = initial creation

  @Column({ name: 'to_status', type: 'enum', enum: OrderStatus })
  toStatus: OrderStatus;

  @Column({ name: 'changed_by' })
  changedBy: string; // userId or 'system'

  @CreateDateColumn({ name: 'changed_at' })
  changedAt: Date;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}
