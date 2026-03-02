import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { DataSource } from "typeorm";
import { seedDefaultStatusOptions } from "./status-option/status-option.seed";

async function bootstrap() {
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
    await seedDefaultStatusOptions(dataSource);
  } catch (error: any) {
    console.warn(
      `Failed to seed default status options: ${error.message}. This is OK if they already exist.`
    );
  }

  const port = process.env.PORT || 3000;
  await app.listen(port);
}

bootstrap();
