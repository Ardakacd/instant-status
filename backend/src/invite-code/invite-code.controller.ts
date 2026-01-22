import { Controller, Post, Body, UseGuards, Request } from "@nestjs/common";
import { InviteCodeService } from "./invite-code.service";
import { AuthGuard } from "../auth/auth.guard";
import { z } from "zod";

const RedeemCodeDtoSchema = z.object({
  code: z.string().length(8),
});

@Controller("invite-code")
export class InviteCodeController {
  constructor(private inviteCodeService: InviteCodeService) {}

  @Post()
  @UseGuards(AuthGuard)
  async generateCode(@Request() req, @Body() body: unknown) {
    const { expires_in_hours } = z
      .object({ expires_in_hours: z.number().optional() })
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
  async redeemCode(@Request() req, @Body() body: unknown) {
    const { code } = RedeemCodeDtoSchema.parse(body);
    return this.inviteCodeService.redeemCode(req.user.id, code);
  }

  @Post("connect-by-link")
  @UseGuards(AuthGuard)
  async connectByLink(@Request() req, @Body() body: unknown) {
    const { user_id } = z.object({ user_id: z.string().uuid() }).parse(body);
    return this.inviteCodeService.connectByLink(req.user.id, user_id);
  }
}
