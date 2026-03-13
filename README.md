# POS Tax Calculation — Hexagonal Architecture

A NestJS application following **Alistair Cockburn's Ports & Adapters (Hexagonal Architecture)** pattern through a POS FOC (Free of Charge) tax calculation system.

## Architecture

```
                    Driving side                          Driven side
                    (calls in)                            (called by app)

              ┌──────────────────┐              ┌──────────────────────────┐
              │  REST Controller │              │  HalfUpRoundingAdapter   │
              │  (driving adapter)│              │  (driven adapter)        │
              └────────┬─────────┘              └──────────▲───────────────┘
                       │                                   │
                       ▼                                   │
              ┌────────────────┐                ┌──────────┴───────────────┐
              │ CalculateTaxPort│               │ RoundingStrategyPort     │
              │ (driving port)  │               │ (driven port)            │
              └────────┬────────┘               └──────────▲───────────────┘
                       │                                   │
                       ▼                                   │
              ┌────────────────────────────────────────────┴──┐
              │              THE HEXAGON                       │
              │                                                │
              │  CalculateTaxUseCase                           │
              │    - FOC treatment logic (BR-01..BR-04)        │
              │    - Tax base calculation                      │
              │    - Audit trail generation                    │
              │                                                │
              │  Domain: Money, Bill, LineItem, FocPolicy      │
              └────────────────────────────┬──────────────────-┘
                                           │
                       ┌───────────────────┼───────────────────┐
                       ▼                   ▼                   ▼
              ┌────────────────┐ ┌─────────────────┐ ┌────────────────┐
              │ JurisdictionRepo│ │ TaxAuditLogPort │ │ RoundingPort   │
              │ (driven port)   │ │ (driven port)   │ │ (driven port)  │
              └───────┬─────────┘ └────────┬────────┘ └────────────────┘
                      ▼                    ▼
              ┌──────────────────┐ ┌──────────────────┐
              │ MySQL Adapter    │ │ MySQL Adapter     │
              │ (driven adapter) │ │ (driven adapter)  │
              └──────────────────┘ └──────────────────┘
```

### Directory Structure

```
src/
  application/                          # THE HEXAGON
    domain/                             #   Value objects & entities
      money.ts                          #     Immutable monetary value (bigint)
      types.ts                          #     Bill, LineItem, FocPolicy, TaxResult, enums
    ports/
      driving/                          #   What the hexagon OFFERS
        calculate-tax.port.ts           #     execute(command) → TaxResult
      driven/                           #   What the hexagon NEEDS
        rounding-strategy.port.ts       #     apply(amount) → Money
        tax-jurisdiction-repository.port.ts
        tax-audit-log.port.ts
    use-cases/                          #   Business logic lives HERE
      calculate-tax.use-case.ts         #     Implements driving port, uses driven ports
  adapters/
    driving/                            # OUTSIDE — calls into the hexagon
      rest/
        tax.controller.ts               #   HTTP → driving port
        dto/calculate-tax.dto.ts
    driven/                             # OUTSIDE — called by the hexagon
      persistence/
        entities/                       #   TypeORM entities
        mysql-tax-jurisdiction-repository.adapter.ts
        mysql-tax-audit-log.adapter.ts
      rounding/
        half-up-rounding.adapter.ts
  tax.module.ts                         # Wiring: ports ↔ adapters
  app.module.ts
  main.ts
```

### Key Principle

**The hexagon has no dependencies on the outside world.**

- `CalculateTaxUseCase` implements the driving port and uses driven ports — it never imports from `adapters/`.
- `TaxController` (driving adapter) only knows the driving port interface — it never imports the use case directly.
- `MysqlTaxJurisdictionRepositoryAdapter` (driven adapter) implements the driven port — the hexagon never imports it.
- `tax.module.ts` is the only place that connects ports to adapters.

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
