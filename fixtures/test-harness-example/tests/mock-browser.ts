import type { TestHarnessOptions } from "@cloudflare/test-harness";
import type { CloudflareWorkersModule } from "@cloudflare/workers-types";

/**
 * A test-only Worker that replaces the Web Worker's Browser Rendering binding.
 * Inline Workers aren't bundled, so its module is plain JavaScript.
 */
export const mockBrowser = {
	config: {
		name: "mock-browser",
		compatibilityDate: "2026-06-01",
		manifest: {
			mainModule: "index.js",
			modules: {
				"index.js": {
					type: "esm",
					contents: `
						import { WorkerEntrypoint } from "cloudflare:workers";

						let screenshot;

						export default class MockBrowser extends WorkerEntrypoint {
							setScreenshot(bytes) {
								screenshot = Uint8Array.from(bytes);
							}

							async quickAction(action, options) {
								if (screenshot === undefined) {
									throw new Error("Mock screenshot has not been configured.");
								}

								return new Response(screenshot, {
									headers: { "content-type": "image/png" },
								});
							}
						}
					`,
				},
			},
		},
	},
} satisfies TestHarnessOptions["workers"][number];

interface MockBrowser extends CloudflareWorkersModule.WorkerEntrypoint {
	setScreenshot(bytes: number[]): void;
}

/** The mock's module type, for `server.getWorker().getExport()` */
export type MockBrowserModule = {
	default: new (
		...args: ConstructorParameters<
			typeof CloudflareWorkersModule.WorkerEntrypoint
		>
	) => MockBrowser;
};
