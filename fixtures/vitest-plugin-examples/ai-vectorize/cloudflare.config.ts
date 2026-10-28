import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineConfig({
	worker: {
		name: "ai-vectorize",
		compatibilityDate: "2025-03-20",
		entrypoint,
		env: {
			VECTORIZE: bindings.vectorize({
				name: "embeddings",
			}),
			AI: bindings.ai(),
		},
	},
});
