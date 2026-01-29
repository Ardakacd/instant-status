import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { StatusOptionController } from "./status-option.controller";
import { StatusOptionService } from "./status-option.service";
import { StatusOption } from "../entities/status-option.entity";
import { Status } from "../entities/status.entity";
import { AuthModule } from "../auth/auth.module";
import { UserModule } from "../user/user.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([StatusOption, Status]),
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
  ],
  controllers: [StatusOptionController],
  providers: [StatusOptionService],
  exports: [StatusOptionService],
})
export class StatusOptionModule {}

