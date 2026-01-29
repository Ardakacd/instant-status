import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { DataSource } from "typeorm";
import { seedDefaultStatusOptions } from "./status-option/status-option.seed";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  app.enableCors({
    origin: true,
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
