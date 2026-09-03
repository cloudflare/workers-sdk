import {
	bindings,
	defineWorker,
	triggers,
} from "@cloudflare/vite-plugin/experimental-config";
import * as apiEntrypoint from "./workers/api/index.ts" with { type: "cf-worker" };
import * as mockBrowserEntrypoint from "./workers/mock-browser/index.ts" with { type: "cf-worker" };
import * as webEntrypoint from "./workers/web/index.ts" with { type: "cf-worker" };

export const apiWorker = defineWorker({
	name: "api-worker",
	entrypoint: apiEntrypoint,
	compatibilityDate: "2026-06-01",
	triggers: [triggers.fetch({ pattern: "api.example.com/v1/*" })],
	env: {
		STORE: bindings.kv({ id: "shared-store" }),
		DATABASE: bindings.d1({
			name: "report-database",
			id: "fake-database-id",
		}),
	},
});

export const mockBrowser = defineWorker({
	name: "mock-browser",
	entrypoint: mockBrowserEntrypoint,
	compatibilityDate: "2026-06-01",
});

export default defineWorker({
	name: "web-worker",
	entrypoint: webEntrypoint,
	compatibilityDate: "2026-06-01",
	triggers: [triggers.fetch({ pattern: "example.com/*" })],
	env: {
		BROWSER: bindings.browser(),
		API: bindings.worker({ worker: "api-worker" }),
	},
});
