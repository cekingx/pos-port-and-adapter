# POS Tax Calculation — Ports & Adapters

A NestJS application demonstrating the **Ports & Adapters (Hexagonal Architecture)** pattern through a POS FOC (Free of Charge) tax calculation system.

## Architecture

```
src/
  domain/                     # Pure business logic — zero framework dependencies
    money.ts                  # Immutable monetary value object (bigint subunits)
    types.ts                  # FocPolicy, Bill, LineItem, TaxResult, enums
    ports/                    # Interfaces that define boundaries
      tax-calculation.port    #   Primary: calculate(bill) → TaxResult
      rounding-strategy.port  #   Secondary: apply(amount) → Money
      tax-jurisdiction-repository.port
      tax-audit-log.port
  adapters/                   # Concrete implementations of ports
    standard-exclusive-tax.adapter    # FOC tax calc (zero_rated, notional_value, merchant_absorbs)
    half-up-rounding.adapter          # Commercial rounding to cents
    persistence/                      # MySQL-backed adapters
      entities/                       #   TypeORM entities
      mysql-tax-jurisdiction-repository.adapter
      mysql-tax-audit-log.adapter
    in-memory-tax-jurisdiction-repository.adapter   # For testing
    console-tax-audit-log.adapter                   # For testing
  tax/                        # NestJS wiring layer
    tax.module.ts             # Binds port tokens → adapter classes
    tax.service.ts            # Application service (DTO → domain → port)
    tax.controller.ts         # REST: POST /tax/calculate
    dto/
```

### Dependency Rule

Dependencies point inward. The domain never imports from adapters or framework code.

```
Controller → Service → Port (interface) ← Adapter (implementation)
```

To swap infrastructure (e.g. MySQL → PostgreSQL), change the `useClass` in `tax.module.ts` — no domain code changes.

## Prerequisites

- Node.js >= 18
- MySQL

## Setup

```bash
npm install
```

Create a `.env` file in the project root:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=
DB_DATABASE=pos
NODE_ENV=development
```

Create the database:

```sql
CREATE DATABASE pos;
```

Tables are created automatically via TypeORM `synchronize` in development mode.

## Running

```bash
# development (watch mode)
npm run start:dev

# production
npm run build
npm run start:prod
```

## API Documentation

Swagger UI is available at [http://localhost:3000/api](http://localhost:3000/api) when the app is running.

### Example Request

```bash
curl -X POST http://localhost:3000/tax/calculate \
  -H 'Content-Type: application/json' \
  -d '{
    "billId": "bill-001",
    "items": [
      { "id": "item-1", "name": "Burger", "price": 10.00, "quantity": 1 },
      { "id": "item-2", "name": "Drink", "price": 3.00, "quantity": 1,
        "foc": { "reason": "promotional", "treatment": "zero_rated" } }
    ],
    "jurisdictionCode": "DEFAULT",
    "taxMode": "exclusive",
    "currency": "USD"
  }'
```

### Example Response

```json
{
  "billId": "bill-001",
  "totalTaxBase": 10.00,
  "totalTaxAmount": 1.00,
  "totalCustomerPays": 11.00,
  "totalMerchantAbsorbs": 0.00,
  "roundingDifference": 0.00,
  "lineItems": [
    { "lineItemId": "item-1", "originalPrice": 10.00, "effectiveTaxBase": 10.00, "taxAmount": 1.00, "customerPays": 10.00, "merchantAbsorbs": 0.00 },
    { "lineItemId": "item-2", "originalPrice": 3.00, "effectiveTaxBase": 0.00, "taxAmount": 0.00, "customerPays": 0.00, "merchantAbsorbs": 0.00 }
  ],
  "auditTrail": [...]
}
```

## FOC Tax Treatments

| Treatment | Tax Base | Customer Pays | Merchant Absorbs |
|---|---|---|---|
| `zero_rated` | $0 | $0 | $0 (no tax liability) |
| `notional_value` | Original price | $0 | Item price + tax |
| `merchant_absorbs` | Full price | $0 | Full price + tax |

## FOC Reasons → Default Treatments

| Reason | Default Treatment |
|---|---|
| `promotional` | `zero_rated` |
| `service_recovery` | `zero_rated` |
| `staff_consumption` | `notional_value` |
| `damaged_goods` | `zero_rated` |
| `complimentary_bill` | `merchant_absorbs` |

## Tests

```bash
# unit tests
npm run test

# test coverage
npm run test:cov
```

## License

MIT
