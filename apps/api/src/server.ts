import { createApp } from './app';
import { config } from './config';

const app = createApp();

app.listen(config.port, config.host, () => {
  console.log(`[patimeet] API ${config.host}:${config.port} üzerinde çalışıyor`);
  console.log(`[patimeet] Veritabanı: ${config.dbFile}`);
});
