import { DataSource, IsNull } from "typeorm";
import { StatusOption } from "../entities/status-option.entity";
import { StructuredLogger } from "../common/logger/structured-logger";

/**
 * Seeds default system status options
 * Run this after database migrations to populate initial status options
 */
export async function seedDefaultStatusOptions(
  dataSource: DataSource,
  logger: StructuredLogger
) {
  const statusOptionRepository = dataSource.getRepository(StatusOption);

  const existingCount = await statusOptionRepository.count({
    where: { user_id: IsNull() },
  });

  if (existingCount > 0) {
    logger.log("Default status options already exist, skipping seed");
    return;
  }

  const defaultStatuses: Omit<StatusOption, "id" | "user">[] = [
    {
      user_id: null,
      label: "Available",
      emoji: "✅",
      color: "#10B981",
      sort_order: 0,
    },
    {
      user_id: null,
      label: "Busy",
      emoji: "🔴",
      color: "#F59E0B",
      sort_order: 1,
    },
  ];

  const statusOptions = statusOptionRepository.create(defaultStatuses);
  await statusOptionRepository.save(statusOptions);

  logger.log(`Seeded ${defaultStatuses.length} default status options`);
}

