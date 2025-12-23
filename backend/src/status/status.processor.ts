import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Status, StatusState } from "../entities/status.entity";

@Processor("status-expiration")
export class StatusProcessor extends WorkerHost {
  constructor(
    @InjectRepository(Status)
    private statusRepository: Repository<Status>
  ) {
    super();
  }

  async process(job: Job<{ userId: string; statusId: string }>) {
    const { userId } = job.data;

    // Use PostgreSQL NOW() to compare timestamps correctly across timezones
    const expiredStatuses = await this.statusRepository
      .createQueryBuilder("status")
      .where("status.user_id = :userId", { userId })
      .andWhere("status.expires_at IS NOT NULL")
      .andWhere("status.expires_at <= NOW()")
      .getMany();

    for (const status of expiredStatuses) {
      status.state = StatusState.OFFLINE;
      status.expires_at = null;
      await this.statusRepository.save(status);
    }
  }
}
