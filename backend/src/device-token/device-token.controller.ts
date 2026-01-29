import { Controller, Post, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { DeviceTokenService } from './device-token.service';
import { AuthGuard } from '../auth/auth.guard';
import { Platform } from '../entities/device-token.entity';
import { z } from 'zod';

const RegisterTokenDtoSchema = z
  .object({
    token: z.string().min(1).max(500),
    platform: z.nativeEnum(Platform),
  })
  .strict(); // Reject unknown fields

@Controller('device-token')
@UseGuards(AuthGuard)
export class DeviceTokenController {
  constructor(private deviceTokenService: DeviceTokenService) {}

  @Post()
  async registerToken(@Request() req, @Body() body: unknown) {
    const { token, platform } = RegisterTokenDtoSchema.parse(body);
    const deviceToken = await this.deviceTokenService.registerToken(
      req.user.id,
      token,
      platform,
    );
    return {
      id: deviceToken.id,
      platform: deviceToken.platform,
      created_at: deviceToken.created_at,
    };
  }

  @Delete(':id')
  async deleteToken(@Param('id') id: string) {
    await this.deviceTokenService.deleteToken(id);
    return { message: 'Device token deleted' };
  }
}

