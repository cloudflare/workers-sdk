import { describe, it } from "vitest";
import { toCloudflareConfig } from "../../src/config-module/convert";

describe("toCloudflareConfig", () => {
	it("maps the base config autoconfig generates to the worker shape", ({
		expect,
	}) => {
		const { worker, tooling } = toCloudflareConfig({
			name: "my-worker",
			compatibility_date: "2026-01-01",
			compatibility_flags: ["nodejs_compat"],
			observability: { enabled: true },
		});

		expect(worker).toEqual({
			name: "my-worker",
			compatibilityDate: "2026-01-01",
			compatibilityFlags: ["nodejs_compat"],
			observability: { enabled: true },
		});
		expect(tooling).toEqual({});
	});

	it("maps `main` to `entrypoint`", ({ expect }) => {
		const { worker } = toCloudflareConfig({ main: "./workers/app.ts" });
		expect(worker.entrypoint).toBe("./workers/app.ts");
	});

	it("splits assets into runtime (worker) and directory (tooling) fields", ({
		expect,
	}) => {
		const { worker, tooling } = toCloudflareConfig({
			assets: {
				binding: "ASSETS",
				directory: "./dist/public",
				html_handling: "drop-trailing-slash",
				not_found_handling: "single-page-application",
			},
		});

		expect(worker.assets).toEqual({
			htmlHandling: "drop-trailing-slash",
			notFoundHandling: "single-page-application",
		});
		expect(worker.env).toEqual({ ASSETS: { type: "assets" } });
		// The directory is a build-time concern owned by Vite, not runtime config.
		expect(tooling).toEqual({ assetsDirectory: "./dist/public" });
	});

	it("emits only the assets directory as tooling when there is nothing to serve at runtime", ({
		expect,
	}) => {
		const { worker, tooling } = toCloudflareConfig({
			assets: { directory: "dist" },
		});

		expect(worker).toEqual({});
		expect(tooling).toEqual({ assetsDirectory: "dist" });
	});
});
