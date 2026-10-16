import { createApp } from './app.ts';

const port = Number(process.env.PORT ?? 3000);

createApp().listen(port, '0.0.0.0', () => {
  console.log(`Imposter Who? server listening on http://0.0.0.0:${port}`);
});
