import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { StatusOptionService } from "./status-option.service";
import { AuthGuard } from "../auth/auth.guard";
import { z } from "zod";

const colorRegex = /^#([0-9A-Fa-f]{3}){1,2}$/; // Supports #FFF and #FFFFFF

const CreateStatusOptionDtoSchema = z
  .object({
    label: z.string().min(1).max(25),
    emoji: z.string().min(1).max(10),
    color: z.string().regex(colorRegex),
    sort_order: z.number().int().optional(),
  })
  .strict(); // Reject unknown fields

const UpdateStatusOptionDtoSchema = z
  .object({
    label: z.string().min(1).max(25).optional(),
    emoji: z.string().min(1).max(10).optional(),
    color: z.string().regex(colorRegex).optional(),
    sort_order: z.number().int().optional(),
  })
  .strict(); // Reject unknown fields

@Controller("status-options")
@UseGuards(AuthGuard)
export class StatusOptionController {
  constructor(private statusOptionService: StatusOptionService) {}

  /**
   * Get all status options available to the user
   * Returns both system statuses and user's custom statuses
   */
  @Get()
  async getStatusOptions(@Request() req) {
    return await this.statusOptionService.getUserStatusOptions(req.user.id);
  }

  /**
   * Get a specific status option by ID
   */
  @Get(":id")
  async getStatusOption(@Request() req, @Param("id") id: string) {
    return await this.statusOptionService.getStatusOptionById(id, req.user.id);
  }

  /**
   * Create a custom status option
   */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 creates/min
  async createStatusOption(@Request() req, @Body() body: unknown) {
    const data = CreateStatusOptionDtoSchema.parse(body);
    return await this.statusOptionService.createCustomStatusOption(
      req.user.id,
      data.label,
      data.emoji,
      data.color,
      data.sort_order
    );
  }

  /**
   * Update a custom status option
   */
  @Patch(":id")
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 updates/min
  async updateStatusOption(
    @Request() req,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    const updates = UpdateStatusOptionDtoSchema.parse(body);
    return await this.statusOptionService.updateCustomStatusOption(
      id,
      req.user.id,
      updates
    );
  }

  /**
   * Delete a custom status option
   */
  @Delete(":id")
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 deletes/min
  async deleteStatusOption(@Request() req, @Param("id") id: string) {
    await this.statusOptionService.deleteCustomStatusOption(id, req.user.id);
    return { message: "Status option deleted successfully" };
  }
}

