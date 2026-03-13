import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TaxModule } from './tax/tax.module';
import { TaxJurisdictionEntity } from './adapters/persistence/entities/tax-jurisdiction.entity';
import { TaxAuditLogEntity } from './adapters/persistence/entities/tax-audit-log.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 3306),
        username: config.get<string>('DB_USERNAME', 'root'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('DB_DATABASE', 'pos'),
        entities: [TaxJurisdictionEntity, TaxAuditLogEntity],
        synchronize: config.get<string>('NODE_ENV') !== 'production',
      }),
    }),
    TaxModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
