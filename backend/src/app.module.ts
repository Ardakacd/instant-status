import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthModule } from "./auth/auth.module";
import { UserModule } from "./user/user.module";
import { ConnectionsModule } from "./connections/connections.module";
import { StatusModule } from "./status/status.module";
import { StatusOptionModule } from "./status-option/status-option.module";
import { InviteCodeModule } from "./invite-code/invite-code.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { DeviceTokenModule } from "./device-token/device-token.module";
import { RedirectModule } from "./redirect/redirect.module";
import { User } from "./entities/user.entity";
import { Status } from "./entities/status.entity";
import { StatusOption } from "./entities/status-option.entity";
import { Connection } from "./entities/connection.entity";
import { InviteCode } from "./entities/invite-code.entity";
import { DeviceToken } from "./entities/device-token.entity";
import { ProcessedWebhook } from "./entities/processed-webhook.entity";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath:
        process.env.NODE_ENV === "production"
          ? ".env.production"
          : ".env.development",
    }),
    TypeOrmModule.forRoot({
      type: "postgres",
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432"),
      username: process.env.DB_USERNAME || "postgres",
      password: process.env.DB_PASSWORD || "postgres",
      database: process.env.DB_NAME || "instant_status",
      entities: [User, Status, StatusOption, Connection, InviteCode, DeviceToken, ProcessedWebhook],
      synchronize: process.env.NODE_ENV !== "production",
      logging: process.env.NODE_ENV === "development",
    }),
    AuthModule,
    UserModule,
    ConnectionsModule,
    StatusModule,
    StatusOptionModule,
    InviteCodeModule,
    WebhooksModule,
    DeviceTokenModule,
    RedirectModule,
  ],
})
export class AppModule {}
