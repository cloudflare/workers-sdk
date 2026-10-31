import { bindings, defineConfig } from "cf/config";

export default defineConfig(({ mode }) => {
	const isDevelopment = mode === "development";

	return {
		worker: {
			name: "workers-playground",
			compatibilityDate: "2025-07-01",
			assets: {
				notFoundHandling: "single-page-application",
				...(isDevelopment
					? { runWorkerFirst: ["/playground/api/*", "/playground"] }
					: {}),
			},
			workersDev: true,
			previewUrls: true,
			// Production is assets-only; local development adds a Worker to proxy
			// requests to the testing playground-preview-worker.
			...(isDevelopment
				? {
						entrypoint: "./worker/index.ts",
					}
				: {}),
			env: { ASSETS: isDevelopment && bindings.assets() },
		},
	};
});
