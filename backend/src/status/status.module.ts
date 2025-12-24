import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StatusController } from "./status.controller";
import { StatusService } from "./status.service";
import { Status } from "../entities/status.entity";
import { Connection } from "../entities/connection.entity";
import { DeviceToken } from "../entities/device-token.entity";
import { User } from "../entities/user.entity";
import { AuthModule } from "../auth/auth.module";
import { UserModule } from "../user/user.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Status, Connection, DeviceToken, User]),
    AuthModule,
    forwardRef(() => UserModule),
  ],
  controllers: [StatusController],
  providers: [StatusService],
})
export class StatusModule {}
