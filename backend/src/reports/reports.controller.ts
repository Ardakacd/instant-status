import { Controller, Post, Body, UseGuards, Request } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { AuthGuard } from "../auth/auth.guard";
import { ReportsService, CreateReportDto } from "./reports.service";

const CreateReportSchema = z
  .object({
    reason: z.enum([
      "child_safety",
      "harassment",
      "impersonation",
      "spam",
      "inappropriate_content",
      "other",
    ]),
    reported_user_id: z.string().uuid().optional(),
    details: z.string().max(2000).optional(),
  })
  .strict();

@Controller("reports")
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 reports/hour — abuse prevention
  async createReport(@Body() body: unknown, @Request() req) {
    const dto = CreateReportSchema.parse(body) as CreateReportDto;
    await this.reportsService.createReport(req.user, dto);
    return { success: true };
  }
}
