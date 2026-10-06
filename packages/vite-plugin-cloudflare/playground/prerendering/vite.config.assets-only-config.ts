import { createConfig } from "./vite.config";

// A Wrangler config with no `main` resolves to an assets-only config, which can
// still carry a prerender Worker
export default createConfig(false, "./wrangler.assets-only-config.jsonc");
