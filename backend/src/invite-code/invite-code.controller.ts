import { Controller, Post, Body, UseGuards, Request } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { InviteCodeService } from "./invite-code.service";
import { AuthGuard } from "../auth/auth.guard";
import { z } from "zod";

const RedeemCodeDtoSchema = z
  .object({
    code: z.string().length(8),
  })
  .strict(); // Reject unknown fields

@Controller("invite-code")
export class InviteCodeController {
  constructor(private inviteCodeService: InviteCodeService) {}

  @Post()
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 generates/min
  async generateCode(@Request() req, @Body() body: unknown) {
    const { expires_in_hours } = z
      .object({ expires_in_hours: z.number().optional() })
      .strict() // Reject unknown fields
      .parse(body);

    const inviteCode = await this.inviteCodeService.generateCode(
      req.user.id,
      expires_in_hours
    );

    return {
      code: inviteCode.code,
      expires_at: inviteCode.expires_at,
      created_at: inviteCode.created_at,
    };
  }

  @Post("redeem")
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 req/min – prevent brute force
  async redeemCode(@Request() req, @Body() body: unknown) {
    const { code } = RedeemCodeDtoSchema.parse(body);
    return this.inviteCodeService.redeemCode(req.user.id, code);
  }

  @Post("connect-by-link")
  @UseGuards(AuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 connects/min
  async connectByLink(@Request() req, @Body() body: unknown) {
    const { user_id } = z
      .object({ user_id: z.string().uuid() })
      .strict() // Reject unknown fields
      .parse(body);
    return this.inviteCodeService.connectByLink(req.user.id, user_id);
  }
}
