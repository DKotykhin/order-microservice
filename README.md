# Order Microservice

![NestJS](https://img.shields.io/badge/NestJS-E0234E?style=flat&logo=nestjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat&logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=flat&logo=redis&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-FF4444?style=flat)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-FF6600?style=flat&logo=rabbitmq&logoColor=white)
![Jest](https://img.shields.io/badge/Jest-C21325?style=flat&logo=jest&logoColor=white)
![ESLint](https://img.shields.io/badge/ESLint-4B32C3?style=flat&logo=eslint&logoColor=white)
![Prettier](https://img.shields.io/badge/Prettier-F7B93E?style=flat&logo=prettier&logoColor=black)

Handles shopping cart management for the CoffeeDoor platform. Exposes a gRPC API, stores cart state in Redis, and integrates with the store-item, user, and notification microservices.

---

## Features

- **Cart CRUD** — add, update, remove items and clear the cart via gRPC
- **Price & availability sync** — on every `GetCart` call, prices and availability are re-fetched from the store service and silently updated in Redis
- **Enriched cart items** — `title`, `variantName`, and `imageUrl` are stored alongside price so responses and emails are human-readable without extra lookups
- **Abandoned cart reminders** — BullMQ schedules delayed email jobs (1 h / 24 h / 72 h) after any cart mutation; jobs are cancelled when the cart is cleared or an order is placed
- **Sliding TTL** — the 7-day Redis TTL resets on every read and write, keeping active carts alive

---

## Architecture

```
Client (gRPC)
    │
    ▼
CartController (gRPC)
    │
    ▼
CartService
    ├── Redis           — cart state storage (hash per user, 7-day TTL)
    ├── StoreItemService (gRPC) — price/availability/display field sync
    └── CartAbandonmentService
            ├── BullMQ  — delayed job scheduling (uses same Redis)
            └── UserService (gRPC) + MessageBrokerService (RabbitMQ)
                        — resolves user email, emits notification.email.send
```

---

## Inter-service Communication

| Dependency | Transport | Purpose |
|---|---|---|
| `store-item-microservice` | gRPC | Validate item availability, fetch price and display fields |
| `user-microservice` | gRPC | Resolve user email for abandonment emails |
| `notification-microservice` | RabbitMQ (`notification.email.send`) | Send abandoned cart emails |

---

## Environment Variables

| Variable | Description |
|---|---|
| `NODE_ENV` | Runtime environment (`development` / `production`) |
| `TRANSPORT_URL` | gRPC bind address (e.g. `0.0.0.0:5005`) |
| `HTTP_PORT` | HTTP port for health/metrics (e.g. `9105`) |
| `REDIS_HOST` | Redis hostname |
| `REDIS_PORT` | Redis port |
| `REDIS_DB` | Redis database index (0–15) |
| `RABBITMQ_URL` | RabbitMQ AMQP connection URL |
| `RABBITMQ_QUEUE` | RabbitMQ queue name for outgoing notifications |
| `STORE_SERVICE_URL` | gRPC address of the store-item microservice |
| `USER_SERVICE_URL` | gRPC address of the user microservice |
| `DATABASE_URL` | Postgres URL (reserved for order persistence, not yet used) |

Copy `.env.example` to `.env.local` and fill in values before running locally.

---

## Setup

```bash
npm install
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
# example for cart.proto
protoc -I ./proto ./proto/cart.proto \
  --ts_proto_out=./src/generated-types \
  --ts_proto_opt=nestJs=true \
  --ts_proto_opt=useNullAsOptional=true \
  --ts_proto_opt=useDate=true
```

---

## Cart Data Model

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

---

## Abandoned Cart Reminders

When any cart mutation occurs, three BullMQ jobs are (re-)scheduled:

| Job | Delay | Trigger condition |
|---|---|---|
| Reminder 0 | 1 hour | Cart still non-empty |
| Reminder 1 | 24 hours | Cart still non-empty |
| Reminder 2 | 72 hours | Cart still non-empty |

All pending jobs are cancelled when `ClearCart` is called. Job IDs are deterministic (`abandoned:{userId}:{index}`) so rescheduling on subsequent mutations safely replaces the previous timers.
