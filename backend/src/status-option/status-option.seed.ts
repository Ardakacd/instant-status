import { DataSource, IsNull } from "typeorm";
import { StatusOption } from "../entities/status-option.entity";

/**
 * Seeds default system status options
 * Run this after database migrations to populate initial status options
 */
export async function seedDefaultStatusOptions(dataSource: DataSource) {
  const statusOptionRepository = dataSource.getRepository(StatusOption);

  // Check if default statuses already exist
  const existingCount = await statusOptionRepository.count({
    where: { user_id: IsNull() },
  });

  if (existingCount > 0) {
    console.log("Default status options already exist, skipping seed");
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

  console.log(`✅ Seeded ${defaultStatuses.length} default status options`);
}

