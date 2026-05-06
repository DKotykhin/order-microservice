import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { OrderItem } from '../order-item/entities/order-item.entity';
import { OrderFilters, OrderSort, OrderStatus, SortOrder } from '../generated-types/order';
import { Order } from './entities/order.entity';
import { GRPC_CURRENCY_TO_DB, GRPC_STATUS_TO_DB } from './order.mappers';

const ALLOWED_SORT_FIELDS = new Set(['createdAt', 'totalPrice', 'status']);

@Injectable()
export class OrderRepository {
  constructor(
    @InjectRepository(Order) private readonly orderRepo: Repository<Order>,
    @InjectRepository(OrderItem) private readonly orderItemRepo: Repository<OrderItem>,
  ) {}

  async findById(id: string): Promise<Order | null> {
    return this.orderRepo.findOne({ where: { id }, relations: { items: true } });
  }

  async findByUser(
    userId: string,
    page: number,
    limit: number,
    filters?: OrderFilters,
    sort?: OrderSort,
  ): Promise<[Order[], number]> {
    const qb = this.baseQuery().andWhere('order.userId = :userId', { userId });
    this.applyFilters(qb, filters);
    this.applySort(qb, sort);
    return qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }

  async findAll(page: number, limit: number, filters?: OrderFilters, sort?: OrderSort): Promise<[Order[], number]> {
    const qb = this.baseQuery();
    this.applyFilters(qb, filters);
    this.applySort(qb, sort);
    return qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
  }

  async createWithItems(orderData: Partial<Order>, itemsData: Partial<OrderItem>[]): Promise<Order> {
    const order = await this.orderRepo.save(this.orderRepo.create(orderData));
    order.items = await this.orderItemRepo.save(
      itemsData.map((item) => this.orderItemRepo.create({ ...item, order: { id: order.id } })),
    );
    return order;
  }

  async save(order: Order): Promise<Order> {
    return this.orderRepo.save(order);
  }

  private baseQuery(): SelectQueryBuilder<Order> {
    return this.orderRepo.createQueryBuilder('order').leftJoinAndSelect('order.items', 'items');
  }

  private applyFilters(qb: SelectQueryBuilder<Order>, filters?: OrderFilters): void {
    if (!filters) return;

    const dbStatuses = filters.statuses
      ?.filter((s) => s !== OrderStatus.ORDER_STATUS_UNSPECIFIED)
      .map((s) => GRPC_STATUS_TO_DB[s])
      .filter(Boolean);

    if (dbStatuses?.length) {
      qb.andWhere('order.status IN (:...statuses)', { statuses: dbStatuses });
    }
    if (filters.dateFrom) {
      qb.andWhere('order.createdAt >= :dateFrom', { dateFrom: new Date(filters.dateFrom) });
    }
    if (filters.dateTo) {
      qb.andWhere('order.createdAt <= :dateTo', { dateTo: new Date(filters.dateTo) });
    }
    if (filters.minPrice != null) {
      qb.andWhere('order.totalPrice >= :minPrice', { minPrice: filters.minPrice });
    }
    if (filters.maxPrice != null) {
      qb.andWhere('order.totalPrice <= :maxPrice', { maxPrice: filters.maxPrice });
    }
    if (filters.currency) {
      const dbCurrency = GRPC_CURRENCY_TO_DB[filters.currency];
      if (dbCurrency) {
        qb.andWhere('order.currency = :currency', { currency: dbCurrency });
      }
    }
  }

  private applySort(qb: SelectQueryBuilder<Order>, sort?: OrderSort): void {
    const field = ALLOWED_SORT_FIELDS.has(sort?.field ?? '') ? sort!.field : 'createdAt';
    const direction = sort?.order === SortOrder.SORT_ORDER_ASC ? 'ASC' : 'DESC';
    qb.orderBy(`order.${field}`, direction);
  }
}
