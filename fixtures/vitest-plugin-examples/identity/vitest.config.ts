import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";
export default defineConfig({test:{include:["test/*.test.js"]},plugins:[cloudflareTest({experimental:{newConfig:true}})]});
