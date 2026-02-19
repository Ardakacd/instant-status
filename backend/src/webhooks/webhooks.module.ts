import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";
import { UserModule } from "../user/user.module";
import { ProcessedWebhook } from "../entities/processed-webhook.entity";

@Module({
  imports: [UserModule, TypeOrmModule.forFeature([ProcessedWebhook])],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}

