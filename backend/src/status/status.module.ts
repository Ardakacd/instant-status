import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';
import { StatusProcessor } from './status.processor';
import { Status } from '../entities/status.entity';
import { Connection } from '../entities/connection.entity';
import { DeviceToken } from '../entities/device-token.entity';
import { User } from '../entities/user.entity';
import { AuthModule } from '../auth/auth.module';
import { UserModule } from '../user/user.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Status, Connection, DeviceToken, User]),
    BullModule.registerQueue({
      name: 'status-expiration',
    }),
    AuthModule,
    forwardRef(() => UserModule),
  ],
  controllers: [StatusController],
  providers: [StatusService, StatusProcessor],
})
export class StatusModule {}

