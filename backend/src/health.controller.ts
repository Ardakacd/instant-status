import {
  Controller,
  Get,
  ServiceUnavailableException,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

/**
 * Minimum app version required. Clients below this version see a force-update screen.
 * Bump this when you ship a breaking API change.
 */
const MIN_APP_VERSION = "1.0.0";

@Controller()
export class HealthController {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  @Get("health")
  @SkipThrottle()
  health() {
    return { status: "ok", minVersion: MIN_APP_VERSION };
  }

  /**
   * Verifies the API process can open a connection to Postgres (deploy / networking checks).
   * Does not replace DB monitoring; remove or narrow if you prefer not to expose this.
   */
  @Get("health/db")
  @SkipThrottle()
  async healthDb() {
    try {
      await this.dataSource.query("SELECT 1");
      return { status: "ok", db: true };
    } catch {
      throw new ServiceUnavailableException("Database unreachable");
    }
  }
}
