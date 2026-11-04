import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

const DEFAULT_PORT = 3000;
/** Bind every interface so phones, emulators and other LAN machines can reach the dev server. */
const LISTEN_HOST = '0.0.0.0';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true });
  await app.listen(process.env.PORT ?? DEFAULT_PORT, LISTEN_HOST);
}
void bootstrap();
