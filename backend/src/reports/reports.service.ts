import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../entities/user.entity";
import { Status } from "../entities/status.entity";
import { EmailService } from "../email/email.service";
import { StructuredLogger } from "../common/logger/structured-logger";
import { redactUid, redactEmail } from "../utils/redact";

export interface CreateReportDto {
  reason:
    | "child_safety"
    | "harassment"
    | "impersonation"
    | "spam"
    | "inappropriate_content"
    | "other";
  reported_user_id?: string;
  details?: string;
}

@Injectable()
export class ReportsService {
  private readonly logger = new StructuredLogger(ReportsService.name);

  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Status) private statusRepo: Repository<Status>,
    private emailService: EmailService
  ) {}

  async createReport(reporter: User, dto: CreateReportDto): Promise<void> {
    let reportedUser: User | null = null;
    let reportedStatus: { note: string | null; optionLabel: string } | null =
      null;

    if (dto.reported_user_id) {
      reportedUser = await this.userRepo.findOne({
        where: { id: dto.reported_user_id },
      });

      if (!reportedUser) {
        throw new NotFoundException("Reported user not found");
      }

      // Load current status snapshot — not mandatory for the report to proceed
      try {
        const status = await this.statusRepo.findOne({
          where: { user_id: dto.reported_user_id },
          relations: ["option"],
        });

        if (status) {
          reportedStatus = {
            note: status.note,
            optionLabel: status.option?.label ?? "(unknown)",
          };
        }
      } catch (statusErr: any) {
        this.logger.warn(
          `Could not load status snapshot for report: ${statusErr.message}`,
          {
            event: "report_status_load_failed",
            reportedUserRedacted: redactUid(dto.reported_user_id),
          }
        );
      }
    }

    try {
      await this.emailService.sendSafetyReport({
        reporter: {
          id: reporter.id,
          email: reporter.email,
          name:
            [reporter.first_name, reporter.last_name]
              .filter(Boolean)
              .join(" ") || null,
        },
        reportedUser: reportedUser
          ? {
              id: reportedUser.id,
              email: reportedUser.email,
              name:
                [reportedUser.first_name, reportedUser.last_name]
                  .filter(Boolean)
                  .join(" ") || null,
            }
          : null,
        reason: dto.reason,
        details: dto.details ?? null,
        reportedStatus,
        timestamp: new Date(),
      });

      this.logger.log("Safety report submitted", {
        event: "safety_report_submitted",
        reason: dto.reason,
        reporterRedacted: redactUid(reporter.id),
        reporterEmailRedacted: redactEmail(reporter.email),
        reportedUserRedacted: reportedUser ? redactUid(reportedUser.id) : null,
      });
    } catch (error: any) {
      this.logger.error(`Failed to send safety report: ${error.message}`, {
        event: "safety_report_failed",
        reason: dto.reason,
        reporterRedacted: redactUid(reporter.id),
        error: error.message,
        stack: error.stack,
      });
      throw new InternalServerErrorException(
        "Failed to submit report. Please try again later."
      );
    }
  }
}
