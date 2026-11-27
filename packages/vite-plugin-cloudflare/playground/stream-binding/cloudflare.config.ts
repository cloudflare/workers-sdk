import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "stream-binding-worker",
		entrypoint,
		compatibilityDate: "2026-03-23",
		env: { STREAM: bindings.stream() },
	},
});
