import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { OrderStatus as DbOrderStatus } from '../database/db.enums';
import { OrderStatus, type OrderStatusHistoryResponse } from '../generated-types/order';
import { DB_STATUS_TO_GRPC } from '../order/order.mappers';
import { OrderStatusHistory } from './entities/order-status-history.entity';

interface AppendParams {
  orderId: string;
  fromStatus: DbOrderStatus | null;
  toStatus: DbOrderStatus;
  changedBy: string;
  notes?: string;
}

@Injectable()
export class OrderStatusHistoryService {
  constructor(
    @InjectRepository(OrderStatusHistory)
    private readonly historyRepository: Repository<OrderStatusHistory>,
  ) {}

  async append(params: AppendParams, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(OrderStatusHistory) : this.historyRepository;
    await repo.save(
      repo.create({
        orderId: params.orderId,
        fromStatus: params.fromStatus ?? null,
        toStatus: params.toStatus,
        changedBy: params.changedBy,
        notes: params.notes ?? null,
      }),
    );
  }

  async findByOrderId(orderId: string): Promise<OrderStatusHistoryResponse> {
    const entries = await this.historyRepository.find({
      where: { orderId },
      order: { changedAt: 'ASC' },
    });

    return {
      entries: entries.map((e) => ({
        id: e.id,
        orderId: e.orderId,
        fromStatus: e.fromStatus ? DB_STATUS_TO_GRPC[e.fromStatus] : OrderStatus.ORDER_STATUS_UNSPECIFIED,
        toStatus: DB_STATUS_TO_GRPC[e.toStatus],
        changedBy: e.changedBy,
        changedAt: e.changedAt.toISOString(),
      })),
    };
  }
}
