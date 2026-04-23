import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";

/**
 * Minimum app version required. Clients below this version see a force-update screen.
 * Bump this when you ship a breaking API change.
 */
const MIN_APP_VERSION = "1.0.0";

@Controller()
export class HealthController {
  @Get("health")
  @SkipThrottle()
  health() {
    return { status: "ok", minVersion: MIN_APP_VERSION };
  }
}
