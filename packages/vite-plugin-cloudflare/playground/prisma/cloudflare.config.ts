import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "worker",
		entrypoint,
		compatibilityDate: "2024-12-30",
		env: {
			DB: bindings.d1({ id: "local", name: "prisma-demo-db" }),
		},
	},
});
