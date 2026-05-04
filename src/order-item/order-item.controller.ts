import { Controller, Logger } from '@nestjs/common';
import { OrderItemService } from './order-item.service';

@Controller('order-item')
export class OrderItemController {
  private readonly logger = new Logger(OrderItemController.name);

  constructor(private readonly orderItemService: OrderItemService) {}
}
