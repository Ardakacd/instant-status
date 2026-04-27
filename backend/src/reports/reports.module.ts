import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { User } from "../entities/user.entity";
import { Status } from "../entities/status.entity";
import { AuthModule } from "../auth/auth.module";
import { UserModule } from "../user/user.module";
import { EmailModule } from "../email/email.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Status]),
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    EmailModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
