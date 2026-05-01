import { validateSync } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { Logger } from '@nestjs/common';

const logger = new Logger('EnvValidator');

export function validateEnv<T extends object>(config: Record<string, string | undefined>, envClass: new () => T): T {
  const validatedConfig = plainToInstance(envClass, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const formattedErrors = errors.map((error) => ({
      property: error.property,
      value: error.value as string | undefined,
      constraints: error.constraints,
    }));

    logger.error('Environment validation failed', formattedErrors);

    throw new Error(
      `Invalid environment configuration:\n${formattedErrors
        .map(
          (e) => `- ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')} (value: ${e.value ?? 'undefined'})`,
        )
        .join('\n')}`,
    );
  }
  logger.log('Environment validation succeeded');

  return validatedConfig;
}
