import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InviteCodeController } from './invite-code.controller';
import { InviteCodeService } from './invite-code.service';
import { InviteCode } from '../entities/invite-code.entity';
import { User } from '../entities/user.entity';
import { ConnectionsModule } from '../connections/connections.module';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([InviteCode, User]),
    ConnectionsModule,
    AuthModule,
    forwardRef(() => UserModule),
  ],
  controllers: [InviteCodeController],
  providers: [InviteCodeService],
})
export class InviteCodeModule {}

