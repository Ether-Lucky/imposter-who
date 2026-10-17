import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const SERVER = `http://localhost:${process.env.PORT ?? 3000}`;

/** Serve /host and /play from their HTML entry points in dev, like Express does in prod. */
function cleanEntryUrls(): Plugin {
  return {
    name: 'clean-entry-urls',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const path = req.url?.split('?')[0];
        if (path === '/' || path === '/host') req.url = '/host.html';
        else if (path === '/play') req.url = '/play.html';
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), cleanEntryUrls()],
  server: {
    host: true,
    // VITE_PORT lets a second copy (tests, a dev run) sit beside a game already on 5173.
    port: Number(process.env.VITE_PORT ?? 5173),
    strictPort: true,
    proxy: {
      '/socket.io': { target: SERVER, ws: true, xfwd: true },
      '/api': { target: SERVER, xfwd: true },
    },
  },
  build: {
    rollupOptions: {
      input: {
        host: resolve(import.meta.dirname, 'host.html'),
        play: resolve(import.meta.dirname, 'play.html'),
      },
    },
  },
});
