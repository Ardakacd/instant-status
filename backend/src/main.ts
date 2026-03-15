import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { StructuredLogger } from "./common/logger/structured-logger";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { DataSource } from "typeorm";
import { seedDefaultStatusOptions } from "./status-option/status-option.seed";

async function bootstrap() {
  const logger = new StructuredLogger("Bootstrap");

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1); // Trust exactly one proxy (ALB) for correct client IP
  }

  app.use(helmet());

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  app.enableCors({
    origin:
      process.env.NODE_ENV === "production"
        ? ["https://instantstatus.app"]
        : true,
    credentials: true,
  });

  // Seed default status options on startup
  try {
    const dataSource = app.get(DataSource);
    await seedDefaultStatusOptions(dataSource, logger);
  } catch (error: any) {
    logger.warn(
      `Seed default status options failed: ${error.message}. This is OK if they already exist.`
    );
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`Application listening on port ${port}`);
}

bootstrap();
