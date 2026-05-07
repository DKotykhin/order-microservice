# Order / Cart Service — Recommended Improvements

## Completed

- [x] Replace `synchronize: true` with TypeORM migrations
- [x] Idempotency on order creation
- [x] Health check implementation
- [x] Order confirmation email
- [x] Clear user cart on order creation
- [x] Price drift protection at checkout
- [x] Save for Later / Wishlist
- [x] Order search and filtering
- [x] Order status history / audit log
- [x] Refund/Return flow

---

## High Priority

- [ ] **Inventory reservation**
  Cart addition checks availability but nothing reserves stock. Two users can add the last item and both succeed at checkout. Implement reserve-on-add-to-cart with release on cart clear/TTL expiry, or at minimum reserve-on-checkout.

---

## Medium Priority

- [ ] **Coupon / Promo code support**
  No discount code system exists. Add a coupon field to `CreateOrderRequest` and `CartResponse`. Implement validation logic (percentage vs fixed, usage limits, expiry date) — likely a new coupon-microservice or a table in this service.

---
