import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

// Driving adapter (outside the hexagon — calls into it)
import { TaxController } from './adapters/driving/rest/tax.controller';

// Driving port token
import { CALCULATE_TAX_PORT } from './application/ports/driving/calculate-tax.port';

// Use case (inside the hexagon — implements the driving port)
import { CalculateTaxUseCase } from './application/use-cases/calculate-tax.use-case';

// Driven port tokens
import { ROUNDING_STRATEGY_PORT } from './application/ports/driven/rounding-strategy.port';
import { TAX_JURISDICTION_REPOSITORY_PORT } from './application/ports/driven/tax-jurisdiction-repository.port';
import { TAX_AUDIT_LOG_PORT } from './application/ports/driven/tax-audit-log.port';

// Driven adapters (outside the hexagon — called by it)
import { HalfUpRoundingAdapter } from './adapters/driven/rounding/half-up-rounding.adapter';
import { MysqlTaxJurisdictionRepositoryAdapter } from './adapters/driven/persistence/mysql-tax-jurisdiction-repository.adapter';
import { MysqlTaxAuditLogAdapter } from './adapters/driven/persistence/mysql-tax-audit-log.adapter';

// TypeORM entities
import { TaxJurisdictionEntity } from './adapters/driven/persistence/entities/tax-jurisdiction.entity';
import { TaxAuditLogEntity } from './adapters/driven/persistence/entities/tax-audit-log.entity';

/**
 * Wiring: connects the hexagon to the outside world.
 *
 *   Driving adapter (REST) → Driving port → Use case (hexagon)
 *                                              ↓ uses driven ports
 *                                           Driven adapters (MySQL, rounding)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TaxJurisdictionEntity, TaxAuditLogEntity]),
  ],
  controllers: [TaxController],
  providers: [
    // Driving port → use case (inside the hexagon)
    {
      provide: CALCULATE_TAX_PORT,
      useClass: CalculateTaxUseCase,
    },
    // Driven ports → adapters (outside the hexagon)
    {
      provide: ROUNDING_STRATEGY_PORT,
      useClass: HalfUpRoundingAdapter,
    },
    {
      provide: TAX_JURISDICTION_REPOSITORY_PORT,
      useClass: MysqlTaxJurisdictionRepositoryAdapter,
    },
    {
      provide: TAX_AUDIT_LOG_PORT,
      useClass: MysqlTaxAuditLogAdapter,
    },
  ],
})
export class TaxModule {}
