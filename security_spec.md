# Security Specification: ACCESORIZ2Z

## 1. Data Invariants
- A `Product` must have a valid price and stock.
- An `Order` must belong to a valid `User` and contain at least one item.
- Only users with the `admin` role can create/update `Products`, `Categories`, and `Analytics`.
- Users can only read and write their own `UserProfile`.
- Users can only read their own `Orders`.

## 2. Dirty Dozen Payloads (Targeting Rejection)
1. **Self-Promotion**: Customer attempting to update their `role` to `admin`.
2. **Order Forgery**: User A attempting to read User B's `Orders`.
3. **Price Manipulation**: Customer attempting to create a `Product` with a price of $0.01.
4. **ID Poisoning**: Injecting a 2KB string as a product ID.
5. **Inventory Sabotage**: Customer attempting to update product stock directly.
6. **Shadow Fields**: Creating a UserProfile with a hidden `isVerified: true` field.
7. **Cross-User Leak**: User B attempting to update User A's address.
8. **Invalid Status**: Updating an Order status to a non-existent state like `delivered_for_free`.
9. **Flash Sale bypass**: Updating `flashSaleEndTime` to extend a discount unfairly.
10. **Malicious Analytics**: Overwriting daily analytics data.
11. **Negative Price**: Creating/Updating a product with a negative price.
12. **Orphaned Order**: Creating an order for a user ID that doesn't exist.

## 3. Test Runner
(Tests will be implemented in `DRAFT_firestore.rules` and checked via linting/verification tools).
