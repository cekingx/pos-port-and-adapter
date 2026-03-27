# Project Overview — POS Tax Calculation (Hexagonal Architecture)

## What This Project Is

A **NestJS** application that calculates tax for a Point-of-Sale system, with special handling for **FOC (Free of Charge)** items. It is a learning/demonstration project for **Ports & Adapters (Hexagonal) Architecture** as described by Alistair Cockburn.

The core problem it solves: when a restaurant or retailer gives away an item or an entire bill for free, different tax rules apply depending on *why* it was given away. This app handles all those cases with a full audit trail.

---

## Architecture Overview

```
         Driving side (calls in)          Driven side (called by app)

    ┌────────────────────────┐         ┌──────────────────────────────┐
    │   REST Controller       │         │  HalfUpRoundingAdapter       │
    │   (driving adapter)     │         │  MysqlTaxJurisdictionAdapter │
    └──────────┬─────────────┘         │  MysqlTaxAuditLogAdapter     │
               │                       └──────────────▲───────────────┘
               ▼                                      │
    ┌──────────────────────┐           ┌──────────────┴───────────────┐
    │  CalculateTaxPort     │           │  RoundingStrategyPort        │
    │  (driving port)       │           │  TaxJurisdictionRepoPort     │
    └──────────┬────────────┘           │  TaxAuditLogPort             │
               │                       └──────────────▲───────────────┘
               ▼                                      │
    ┌──────────────────────────────────────────────────┤
    │                   THE HEXAGON                    │
    │  CalculateTaxUseCase                             │
    │    - FOC treatment logic (BR-01..BR-04)          │
    │    - Tax base calculation                        │
    │    - Audit trail generation                      │
    │  Domain: Money, Bill, LineItem, FocPolicy        │
    └──────────────────────────────────────────────────┘
```

**Key principle:** The hexagon (`src/application/`) has zero imports from `src/adapters/`. Wiring happens only in `tax.module.ts`.

---

## Directory Structure

```
src/
  application/                    # THE HEXAGON — no framework dependencies
    domain/
      money.ts                    #   Immutable monetary value (bigint, 4 decimal precision)
      types.ts                    #   All domain types: Bill, LineItem, FocPolicy, TaxResult, etc.
      errors.ts                   #   Typed error union
      result.ts                   #   Result<T, E> type for error propagation
    ports/
      driving/
        calculate-tax.port.ts     #   execute(command) → Result<TaxResult, TaxDomainError>
      driven/
        rounding-strategy.port.ts #   apply(amount: Money) → Money
        tax-jurisdiction-repository.port.ts
        tax-audit-log.port.ts
    use-cases/
      calculate-tax.use-case.ts   #   All business logic lives here
      __tests__/
        calculate-tax.use-case.spec.ts

  adapters/
    persistence/
      entities/                   #   TypeORM entities (TaxJurisdiction, TaxAuditLog)
      mysql-tax-jurisdiction-repository.adapter.ts
      mysql-tax-audit-log.adapter.ts
    rounding/
      half-up-rounding.adapter.ts

  tax/
    tax.controller.ts             #   HTTP → driving port (driving adapter)
    tax.service.ts                #   Thin wrapper; catches unexpected errors
    tax.module.ts                 #   ONLY place that wires ports to adapters
    dto/calculate-tax.dto.ts

  app.module.ts
  main.ts
```

---

## Domain Concepts

### Money
- Stored as `bigint` in **subunits (1/10000 of a currency unit)** to avoid floating-point errors.
- All arithmetic (`add`, `subtract`, `multiplyByRate`) returns `Result<Money, MoneyError>` for currency-mismatch safety.
- Rounding is **never** done inside `Money` — it is deferred to `RoundingStrategyPort`.

### FOC (Free of Charge)
An item or bill given to the customer at $0 cost. Every FOC must have:
- **Scope**: `item` or `bill`
- **Reason**: why it was given away
- **Treatment**: how tax is handled

### FOC Treatments

| Treatment | Tax Base | Customer Pays | Merchant Absorbs |
|---|---|---|---|
| `zero_rated` | $0 | $0 | $0 (no tax liability) |
| `notional_value` | Original price | $0 | Item price + tax |
| `merchant_absorbs` | Full price | $0 | Full price + tax |

### FOC Reason → Default Treatment

| Reason | Default Treatment |
|---|---|
| `promotional` | `zero_rated` |
| `service_recovery` | `zero_rated` |
| `staff_consumption` | `notional_value` |
| `damaged_goods` | `zero_rated` |
| `complimentary_bill` | `merchant_absorbs` |

The default can be overridden per transaction.

---

## Business Rules

| Rule | Description |
|---|---|
| **BR-01** | Bill-level FOC overrides all item-level FOC flags |
| **BR-02** | Every FOC must carry a declared reason |
| **BR-03** | Tax is applied to the **total tax base** (not a sum of per-item taxes) |
| **BR-04** | Rounding is applied **once** at the final total, never per line item |

---

## Calculation Flow (BR-03)

```
1. Look up tax jurisdiction (via driven port)
2. Build domain Bill from HTTP command
3. Resolve effective items — bill-level FOC overrides item-level (BR-01)
4. Determine tax base per item based on FOC treatment
5. Sum all tax bases
6. Apply tax rate to total tax base (one multiplication)
7. Apply rounding strategy once (via driven port, BR-04)
8. Compute what customer pays vs. what merchant absorbs
9. Persist audit trail (via driven port)
10. Return TaxResult
```

---

## Error Handling

The use case returns `Result<TaxResult, TaxDomainError>` — never throws. Errors are typed:
- `JURISDICTION_NOT_FOUND` — unknown jurisdiction code
- `CURRENCY_MISMATCH` — arithmetic on different currencies

`TaxService` wraps the use case and converts unexpected exceptions to HTTP 500.

---

## Stack

| Concern | Technology |
|---|---|
| Framework | NestJS |
| Language | TypeScript |
| Database | MySQL via TypeORM |
| Testing | Jest |
| API Docs | Swagger (at `/api`) |
| Validation | `class-validator` / `class-transformer` |

---

## Running the Project

```bash
# Install dependencies
npm install

# Configure environment (.env)
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=
DB_DATABASE=pos
NODE_ENV=development

# Start (watch mode)
npm run start:dev

# Run tests
npm run test

# Test coverage
npm run test:cov
```

Tables are auto-created by TypeORM `synchronize` in development.

---

## Example Request

```bash
curl -X POST http://localhost:3000/tax/calculate \
  -H 'Content-Type: application/json' \
  -d '{
    "billId": "bill-001",
    "items": [
      { "id": "item-1", "name": "Burger", "price": 10.00, "quantity": 1 },
      { "id": "item-2", "name": "Drink",  "price": 3.00,  "quantity": 1,
        "foc": { "reason": "promotional", "treatment": "zero_rated" } }
    ],
    "jurisdictionCode": "DEFAULT",
    "taxMode": "exclusive",
    "currency": "USD"
  }'
```

Expected: tax base = $10.00, tax = $1.00, customer pays $11.00, drink is free with no tax liability.
