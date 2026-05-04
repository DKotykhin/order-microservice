import { Currencies, OrderStatus as DbOrderStatus, PriceType as DbPriceType } from '../database/db.enums';
import { Currency, OrderStatus, PriceType, type OrderItemResponse, type OrderResponse } from '../generated-types/order';
import { OrderItem } from '../order-item/entities/order-item.entity';
import { Order } from './entities/order.entity';

export const DB_STATUS_TO_GRPC: Record<DbOrderStatus, OrderStatus> = {
  [DbOrderStatus.PENDING]: OrderStatus.ORDER_STATUS_PENDING,
  [DbOrderStatus.CONFIRMED]: OrderStatus.ORDER_STATUS_CONFIRMED,
  [DbOrderStatus.PROCESSING]: OrderStatus.ORDER_STATUS_PROCESSING,
  [DbOrderStatus.SHIPPED]: OrderStatus.ORDER_STATUS_SHIPPED,
  [DbOrderStatus.DELIVERED]: OrderStatus.ORDER_STATUS_DELIVERED,
  [DbOrderStatus.CANCELLED]: OrderStatus.ORDER_STATUS_CANCELLED,
  [DbOrderStatus.REFUNDED]: OrderStatus.ORDER_STATUS_REFUNDED,
};

export const GRPC_STATUS_TO_DB: Record<number, DbOrderStatus> = {
  [OrderStatus.ORDER_STATUS_PENDING]: DbOrderStatus.PENDING,
  [OrderStatus.ORDER_STATUS_CONFIRMED]: DbOrderStatus.CONFIRMED,
  [OrderStatus.ORDER_STATUS_PROCESSING]: DbOrderStatus.PROCESSING,
  [OrderStatus.ORDER_STATUS_SHIPPED]: DbOrderStatus.SHIPPED,
  [OrderStatus.ORDER_STATUS_DELIVERED]: DbOrderStatus.DELIVERED,
  [OrderStatus.ORDER_STATUS_CANCELLED]: DbOrderStatus.CANCELLED,
  [OrderStatus.ORDER_STATUS_REFUNDED]: DbOrderStatus.REFUNDED,
};

export const DB_CURRENCY_TO_GRPC: Record<Currencies, Currency> = {
  [Currencies.USD]: Currency.CURRENCY_USD,
  [Currencies.EUR]: Currency.CURRENCY_EUR,
  [Currencies.GBP]: Currency.CURRENCY_GBP,
  [Currencies.UAH]: Currency.CURRENCY_UAH,
};

export const GRPC_CURRENCY_TO_DB: Record<number, Currencies> = {
  [Currency.CURRENCY_USD]: Currencies.USD,
  [Currency.CURRENCY_EUR]: Currencies.EUR,
  [Currency.CURRENCY_GBP]: Currencies.GBP,
  [Currency.CURRENCY_UAH]: Currencies.UAH,
};

export const DB_PRICE_TYPE_TO_GRPC: Record<DbPriceType, PriceType> = {
  [DbPriceType.REGULAR]: PriceType.PRICE_TYPE_REGULAR,
  [DbPriceType.DISCOUNT]: PriceType.PRICE_TYPE_DISCOUNT,
  [DbPriceType.WHOLESALE]: PriceType.PRICE_TYPE_WHOLESALE,
};

export const GRPC_PRICE_TYPE_TO_DB: Record<number, DbPriceType> = {
  [PriceType.PRICE_TYPE_REGULAR]: DbPriceType.REGULAR,
  [PriceType.PRICE_TYPE_DISCOUNT]: DbPriceType.DISCOUNT,
  [PriceType.PRICE_TYPE_WHOLESALE]: DbPriceType.WHOLESALE,
};

export function mapOrderItem(item: OrderItem): OrderItemResponse {
  return {
    id: item.id,
    productId: item.productId,
    variantId: item.variantId ?? undefined,
    title: item.title,
    variantName: item.variantName ?? undefined,
    imageUrl: item.imageUrl ?? undefined,
    quantity: item.quantity,
    unitPrice: Number(item.unitPrice),
    currency: DB_CURRENCY_TO_GRPC[item.currency] ?? Currency.CURRENCY_UNSPECIFIED,
    priceType: DB_PRICE_TYPE_TO_GRPC[item.priceType] ?? PriceType.PRICE_TYPE_UNSPECIFIED,
  };
}

export function mapOrder(order: Order): OrderResponse {
  return {
    id: order.id,
    userId: order.userId,
    status: DB_STATUS_TO_GRPC[order.status] ?? OrderStatus.ORDER_STATUS_UNSPECIFIED,
    currency: DB_CURRENCY_TO_GRPC[order.currency] ?? Currency.CURRENCY_UNSPECIFIED,
    totalPrice: Number(order.totalPrice),
    notes: order.notes ?? undefined,
    items: (order.items ?? []).map(mapOrderItem),
    createdAt: new Date(order.createdAt).toISOString(),
    updatedAt: new Date(order.updatedAt).toISOString(),
  };
}
