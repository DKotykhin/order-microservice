import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

import { EmailRequest } from './email.request.interface';

@Injectable()
export class MessageBrokerService {
  protected readonly logger = new Logger(MessageBrokerService.name);

  constructor(
    @Inject('NOTIFICATION_MICROSERVICE')
    private readonly notificationMicroserviceClient: ClientProxy,
  ) {}

  async checkConnection(): Promise<void> {
    await this.notificationMicroserviceClient.connect();
  }

  emitMessage(pattern: string, payload: EmailRequest): void {
    this.logger.log(`Emitting event: ${pattern}`);

    this.notificationMicroserviceClient.emit(pattern, payload).subscribe({
      error: (error) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to emit event ${pattern}: ${errorMessage}`);
      },
    });
  }
}
