import {
	bindings,
	defineWorker,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "worker",
	entrypoint,
	compatibilityDate: "2024-12-30",
	env: {
		"importable-env_VAR": bindings.text("my importable env variable"),
		"importable-env_SECRET": bindings.secret(),
	},
});
