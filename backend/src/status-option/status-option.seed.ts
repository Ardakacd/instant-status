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
    // Ensure the "Available" option has is_default = true (backfill for older DBs)
    await statusOptionRepository.update(
      { label: "Available", user_id: IsNull(), is_default: false },
      { is_default: true },
    );
    // Keep system "Available" emoji in sync when we change the canonical default
    await statusOptionRepository.update(
      { label: "Available", user_id: IsNull() },
      { emoji: "🟢" },
    );
    logger.log("Default status options already exist, skipping seed");
    return;
  }

  const defaultStatuses: Omit<StatusOption, "id" | "user">[] = [
    {
      user_id: null,
      label: "Available",
      emoji: "🟢",
      color: "#10B981",
      sort_order: 0,
      is_default: true,
    },
    {
      user_id: null,
      label: "Busy",
      emoji: "🔴",
      color: "#F59E0B",
      sort_order: 1,
      is_default: false,
    },
  ];

  const statusOptions = statusOptionRepository.create(defaultStatuses);
  await statusOptionRepository.save(statusOptions);

  logger.log(`Seeded ${defaultStatuses.length} default status options`);
}

