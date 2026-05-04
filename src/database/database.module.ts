import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService): TypeOrmModuleOptions => ({
        type: 'postgres',
        url: configService.getOrThrow('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [],
  providers: [],
})
export class DatabaseModule {}
