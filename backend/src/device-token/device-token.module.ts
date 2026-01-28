import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceTokenController } from './device-token.controller';
import { DeviceTokenService } from './device-token.service';
import { DeviceToken } from '../entities/device-token.entity';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DeviceToken]),
    AuthModule,
    forwardRef(() => UserModule),
    EmailModule,
  ],
  controllers: [DeviceTokenController],
  providers: [DeviceTokenService],
})
export class DeviceTokenModule {}

