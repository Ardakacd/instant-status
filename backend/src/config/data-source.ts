import { DataSource } from "typeorm";
import * as dotenv from "dotenv";

// Load environment variables for CLI usage (outside NestJS DI)
dotenv.config({
  path:
    process.env.NODE_ENV === "production"
      ? ".env.production"
      : ".env.development",
});

export default new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "instant_status",
  entities: ["src/entities/*.entity.ts"],
  migrations: ["migrations/*.ts"],
  synchronize: false,
  logging: false,
});
