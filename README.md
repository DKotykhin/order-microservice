# Order Microservice

![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-FF4444?style=flat)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-FF6600?style=flat&logo=rabbitmq&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=flat&logo=jest&logoColor=white)
![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=flat&logo=eslint&logoColor=white)
![Prettier](https://img.shields.io/badge/Prettier-F7B93E?style=flat&logo=prettier&logoColor=black)

Handles shopping cart, wishlist, and order persistence for the CoffeeDoor platform. Exposes a gRPC API, stores cart and wishlist state in Redis, persists orders in PostgreSQL, and integrates with the store-item and notification microservices.

---

## Features

- **Cart CRUD** — add, update, remove items and clear the cart via gRPC
- **Price & availability sync** — on every `GetCart` call, prices and availability are re-fetched from the store service and silently updated in Redis
- **Enriched cart items** — `title`, `variantName`, and `imageUrl` are stored alongside price so responses and emails are human-readable without extra lookups
- **Abandoned cart reminders** — BullMQ schedules delayed email jobs (1 h / 24 h / 72 h) after any cart mutation; jobs are cancelled when the cart is cleared or an order is placed
- **Sliding TTL** — the 7-day cart TTL resets on every read and write, keeping active carts alive
- **Wishlist / Save for Later** — users can save items to a persistent wishlist (30-day TTL); supports move-to-cart (re-validates price/availability) and move-to-wishlist (saves cart item including quantity); prices and availability are synced on every `GetWishlist` call; adding a duplicate item is idempotent
- **Order persistence** — converts a cart snapshot into a durable `Order` + `OrderItem` records in PostgreSQL
- **Order lifecycle** — full status progression from `pending` through `delivered` or `cancelled`/`refunded`
- **Price drift protection** — at checkout, every item's price is re-fetched from the store service and the server price is used for the final order; any discrepancy between the client-supplied price and the server price is logged as a warning
- **Immutable item snapshots** — `title`, `variantName`, `imageUrl`, and `unitPrice` are copied at checkout time; store changes do not affect order history
- **Idempotent order creation** — optional `idempotency_key` on `CreateOrder` prevents duplicate orders on client retries; results cached in Redis for 24 hours

---

## Architecture

```
Client (gRPC)
    │
    ├─▶ CartController
    │       └── CartService
    │               ├── Redis                   — cart state (hash per user, 7-day TTL)
    │               ├── StoreItemService (gRPC) — price/availability/display sync
    │               └── CartAbandonmentService
    │                       ├── BullMQ          — delayed job scheduling
    │                       └── MessageBrokerService (RabbitMQ)
    │
    ├─▶ WishlistController
    │       └── WishlistService
    │               ├── Redis                   — wishlist state (hash per user, 30-day TTL)
    │               ├── StoreItemService (gRPC) — price/availability/display sync
    │               └── CartService             — used for move-to-cart
    │
    └─▶ OrderController
            └── OrderService
                    ├── StoreItemService (gRPC) — price re-validation at checkout
                    ├── CartService             — cart cleared automatically after order is created
                    └── OrderRepository
                            └── PostgreSQL      — orders + order_item tables
```

---

## Order Flow

```
Cart (Redis)  ──checkout──▶  CreateOrder (gRPC)
                                  │
                                  ▼
                         Order (status: pending)
                         OrderItem[] (price snapshot)
                                  │
                         UpdateOrderStatus (admin)
                                  │
                     ┌────────────┴────────────┐
                  confirmed                cancelled
                  processing               refunded
                  shipped
                  delivered
```

The caller (typically the API gateway) is responsible for fetching the cart and passing its items to `CreateOrder`. The service handles cart clearing and price validation internally — item prices are re-fetched from the store service at checkout and the server price is always used for the persisted order.

---

## gRPC Services

### CartService (`proto/cart.proto`)

| RPC | Request | Response |
|---|---|---|
| `GetCart` | `UserId` | `CartResponse` |
| `AddToCart` | `AddToCartRequest` | `CartResponse` |
| `UpdateCartItem` | `UpdateCartItemRequest` | `CartResponse` |
| `RemoveFromCart` | `RemoveFromCartRequest` | `CartResponse` |
| `ClearCart` | `UserId` | `StatusResponse` |

### WishlistService (`proto/cart.proto`)

| RPC | Request | Response | Notes |
|---|---|---|---|
| `GetWishlist` | `UserId` | `CartResponse` | Syncs prices and availability before returning |
| `AddToWishlist` | `AddToCartRequest` | `CartResponse` | Idempotent — adding an existing item is a no-op; quantity is always stored as 1 |
| `RemoveFromWishlist` | `RemoveFromCartRequest` | `CartResponse` | |
| `MoveToCart` | `RemoveFromCartRequest` | `CartResponse` | Removes from wishlist, calls `AddToCart` (re-validates price/availability) |
| `MoveToWishlist` | `RemoveFromCartRequest` | `CartResponse` | Removes from cart, saves to wishlist preserving quantity |

### OrderService (`proto/order.proto`)

| RPC | Request | Response | Notes |
|---|---|---|---|
| `CreateOrder` | `CreateOrderRequest` | `OrderResponse` | Converts cart items to a persistent order; pass optional `idempotency_key` to prevent duplicates on retry |
| `GetOrder` | `OrderId` | `OrderResponse` | Returns order with all items |
| `GetOrdersByUser` | `GetOrdersByUserRequest` | `OrderListResponse` | Paginated, sorted newest-first |
| `UpdateOrderStatus` | `UpdateOrderStatusRequest` | `OrderResponse` | Admin / internal use |
| `CancelOrder` | `CancelOrderRequest` | `OrderResponse` | Only `pending` orders; validates ownership |

### HealthCheckService (`proto/health-check.proto`)

| RPC | Request | Response | Notes |
|---|---|---|---|
| `CheckAppHealth` | `Empty` | `HealthCheckResponse` | Lightweight liveness probe — always returns `serving: true` if the process is running |
| `CheckAppConnections` | `Empty` | `ReadinessResponse` | Readiness probe — checks PostgreSQL, Redis, and RabbitMQ connectivity with a 3 s timeout per dependency |

`ReadinessResponse` includes a `dependencies` array with per-service `name`, `healthy`, `message`, and `latencyMs` fields so the caller can identify exactly which dependency is down.

---

## Data Model

### Order (PostgreSQL)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `userId` | varchar | Reference to user service |
| `status` | enum | `pending` → `confirmed` → `processing` → `shipped` → `delivered` / `cancelled` / `refunded` |
| `currency` | enum | `USD`, `EUR`, `GBP`, `UAH` |
| `totalPrice` | decimal(10,2) | Sum of `unitPrice × quantity` for all items |
| `notes` | text | Optional delivery instructions |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

### OrderItem (PostgreSQL)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `orderId` | UUID FK | Cascade delete |
| `productId` | varchar | Snapshot — store-microservice item slug/id |
| `variantId` | varchar | Snapshot — optional attribute variant id |
| `title` | varchar | Snapshot at checkout time |
| `variantName` | varchar | Snapshot at checkout time |
| `imageUrl` | varchar | Snapshot at checkout time |
| `quantity` | int | |
| `unitPrice` | decimal(10,2) | Price at time of purchase |
| `currency` | enum | Per-item currency |
| `priceType` | enum | `regular`, `discount`, `wholesale` |

### Cart item (Redis)

Cart items are stored as a Redis hash at key `cart:{userId}`. Each field is `{productId}` or `{productId}:{variantId}`, and each value is a JSON-serialized `CartItem`:

```json
{
  "productId": "uuid",
  "variantId": "uuid (optional)",
  "quantity": 2,
  "price": 350,
  "currency": 4,
  "title": "Honduras Copan",
  "variantName": "Grind: Whole Bean",
  "imageUrl": "/images/honduras-1.jpg"
}
```

### Wishlist item (Redis)

Wishlist items are stored as a Redis hash at key `wishlist:{userId}` with the same field and value structure as cart items. Quantity is always `1` for items added directly; items moved from the cart preserve their original quantity.

TTL is 30 days and resets on every write. Unavailable items are removed silently on `GetWishlist`.

---

## Inter-service Communication

| Dependency | Transport | Purpose |
|---|---|---|
| `store-item-microservice` | gRPC | Validate item availability, fetch price and display fields |
| `notification-microservice` | RabbitMQ (`notification.email.send`) | Send order confirmation and abandoned cart emails |

---

## Environment Variables

| Variable | Description |
|---|---|
| `NODE_ENV` | Runtime environment (`development` / `production`) |
| `TRANSPORT_URL` | gRPC bind address (e.g. `0.0.0.0:5005`) |
| `HTTP_PORT` | HTTP port for health/metrics (e.g. `9105`) |
| `DATABASE_URL` | PostgreSQL connection URL for order persistence |
| `REDIS_HOST` | Redis hostname |
| `REDIS_PORT` | Redis port |
| `REDIS_DB` | Redis database index (0–15) |
| `RABBITMQ_URL` | RabbitMQ AMQP connection URL |
| `RABBITMQ_QUEUE` | RabbitMQ queue name for outgoing notifications |
| `STORE_SERVICE_URL` | gRPC address of the store-item microservice |

Copy `.env.example` to `.env.local` and fill in values before running locally.

---

## Setup

```bash
npm install
```

## Database

The schema is managed via TypeORM migrations. `synchronize` is disabled — all schema changes must go through migration files.

```bash
# create the database (first time only — Postgres runs in Docker)
docker exec postgres-database psql -U postgres -c "CREATE DATABASE order_db;"

# apply all pending migrations
npm run migration:run

# seed mock data (optional)
npm run seed
```

### Migration commands

```bash
# generate a migration from entity changes
npm run migration:generate

# apply pending migrations
npm run migration:run

# revert the last applied migration
npm run migration:revert

# list applied / pending migrations
npm run migration:show
```

## Running

```bash
# development (watch mode)
npm run start:dev

# production
npm run start:prod
```

## Tests

```bash
# unit tests
npm run test

# unit tests in watch mode
npm run test:watch

# coverage report
npm run test:cov

# e2e tests
npm run test:e2e
```

---

## Proto & Generated Types

Proto files live in `proto/`. TypeScript types are pre-generated in `src/generated-types/` using `ts-proto`.

To regenerate after a proto change:

```bash
protoc -I ./proto ./proto/cart.proto \
  --ts_proto_out=./src/generated-types \
  --ts_proto_opt=nestJs=true

protoc -I ./proto ./proto/order.proto \
  --ts_proto_out=./src/generated-types \
  --ts_proto_opt=nestJs=true
```

---

## Abandoned Cart Reminders

When any cart mutation occurs, three BullMQ jobs are (re-)scheduled:

| Job | Delay | Trigger condition |
|---|---|---|
| Reminder 0 | 1 hour | Cart still non-empty |
| Reminder 1 | 24 hours | Cart still non-empty |
| Reminder 2 | 72 hours | Cart still non-empty |

All pending jobs are cancelled when `ClearCart` is called. Job IDs are deterministic (`abandoned:{userId}:{index}`) so rescheduling on subsequent mutations safely replaces the previous timers.
