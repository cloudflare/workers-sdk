import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint,
		compatibilityDate: "2024-12-30",
		env: {
			"importable-env_VAR": bindings.text("my importable env variable"),
			"importable-env_SECRET": bindings.secret(),
		},
	},
});
