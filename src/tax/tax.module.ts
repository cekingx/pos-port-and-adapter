import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TaxController } from './tax.controller';
import { TaxService } from './tax.service';

// Port tokens
import { TAX_CALCULATION_PORT } from '../domain/ports/tax-calculation.port';
import { ROUNDING_STRATEGY_PORT } from '../domain/ports/rounding-strategy.port';
import { TAX_JURISDICTION_REPOSITORY_PORT } from '../domain/ports/tax-jurisdiction-repository.port';
import { TAX_AUDIT_LOG_PORT } from '../domain/ports/tax-audit-log.port';

// Adapter implementations
import { StandardExclusiveTaxAdapter } from '../adapters/standard-exclusive-tax.adapter';
import { HalfUpRoundingAdapter } from '../adapters/half-up-rounding.adapter';
import { MysqlTaxJurisdictionRepositoryAdapter } from '../adapters/persistence/mysql-tax-jurisdiction-repository.adapter';
import { MysqlTaxAuditLogAdapter } from '../adapters/persistence/mysql-tax-audit-log.adapter';

// TypeORM entities
import { TaxJurisdictionEntity } from '../adapters/persistence/entities/tax-jurisdiction.entity';
import { TaxAuditLogEntity } from '../adapters/persistence/entities/tax-audit-log.entity';

/**
 * This is where ports meet adapters.
 *
 * Each port symbol is bound to a concrete adapter class.
 * To switch from MySQL to PostgreSQL, swap the adapter useClass values —
 * no domain code changes needed.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([TaxJurisdictionEntity, TaxAuditLogEntity]),
  ],
  controllers: [TaxController],
  providers: [
    TaxService,
    {
      provide: ROUNDING_STRATEGY_PORT,
      useClass: HalfUpRoundingAdapter,
    },
    {
      provide: TAX_CALCULATION_PORT,
      useClass: StandardExclusiveTaxAdapter,
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
