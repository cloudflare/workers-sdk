import { describe, test, vi } from "vitest";

// Vite 7 uses esbuild, which preserves standard decorators for `target: ES2022`
// and above. Force the esbuild code path regardless of the installed Vite.
vi.mock("../utils", async (importOriginal) => ({
	...(await importOriginal<typeof import("../utils")>()),
	isRolldown: false,
}));

import { applyWorkerEsbuildSupported } from "../cloudflare-environment";
import type { ResolvedConfig } from "vite";

describe("applyWorkerEsbuildSupported", () => {
	test("lowers decorators in Worker environments so workerd never sees `@decorator` syntax (#12626)", ({
		expect,
	}) => {
		const resolvedViteConfig = {
			esbuild: { supported: {} },
			environments: { worker: {} },
		} as unknown as ResolvedConfig;

		applyWorkerEsbuildSupported(resolvedViteConfig, ["worker"]);

		const workerEsbuild = (
			resolvedViteConfig.environments.worker as {
				esbuild?: { supported?: Record<string, boolean> };
			}
		).esbuild;
		expect(workerEsbuild?.supported?.decorators).toBe(false);
	});
});
