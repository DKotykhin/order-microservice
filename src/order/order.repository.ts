import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OrderItem } from '../order-item/entities/order-item.entity';
import { Order } from './entities/order.entity';

@Injectable()
export class OrderRepository {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
  ) {}

  async findById(id: string): Promise<Order | null> {
    return this.orderRepo.findOne({ where: { id }, relations: { items: true } });
  }

  async findByUser(userId: string, page: number, limit: number): Promise<[Order[], number]> {
    return this.orderRepo.findAndCount({
      where: { userId },
      relations: { items: true },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async createWithItems(
    orderData: Partial<Order>,
    itemsData: Partial<OrderItem>[],
  ): Promise<Order> {
    const order = await this.orderRepo.save(this.orderRepo.create(orderData));
    order.items = await this.orderItemRepo.save(
      itemsData.map((item) => this.orderItemRepo.create({ ...item, order: { id: order.id } })),
    );
    return order;
  }

  async save(order: Order): Promise<Order> {
    return this.orderRepo.save(order);
  }
}
