import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  server: {
    port: 8080,
  },
  plugins: [
    cloudflare({
      auxiliaryWorkers: [
        {
          configPath: '../services/identity/wrangler.toml',
          persistState: {
            path: '../shared-state',
          },
        } as any, // to avoid TS error
        {
          configPath: '../services/passport/wrangler.toml',
          persistState: {
            path: '../shared-state',
          },
        } as any, // to avoid TS error
      ],
    }),
  ],
});
