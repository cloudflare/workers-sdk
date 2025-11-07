import sharedConfig from "@cloudflare/eslint-config-shared";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(globalIgnores(["src/client/**"]), sharedConfig);
