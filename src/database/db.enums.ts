export enum OrderStatus {
  PENDING = 'pending', // just created, awaiting payment
  CONFIRMED = 'confirmed', // payment received
  PROCESSING = 'processing', // being prepared/packed
  SHIPPED = 'shipped', // dispatched
  DELIVERED = 'delivered', // received by customer
  CANCELLED = 'cancelled', // cancelled before shipment
  REFUNDED = 'refunded', // returned and refunded
}

export enum Currencies {
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  UAH = 'UAH',
}

export enum PriceType {
  REGULAR = 'regular',
  DISCOUNT = 'discount',
  WHOLESALE = 'wholesale',
}
