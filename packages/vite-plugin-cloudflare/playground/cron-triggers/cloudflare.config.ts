import {
	defineWorker,
	triggers,
} from "@cloudflare/vite-plugin/experimental-config";
import * as entrypoint from "./src/index.ts" with { type: "cf-worker" };

export default defineWorker({
	name: "cron-trigger-worker",
	entrypoint,
	compatibilityDate: "2025-02-14",
	triggers: [
		triggers.scheduled({ schedule: "* * * * *" }),
		triggers.fetch({
			pattern: "cf-worker-header-test.example.com/*",
			zone: "example.com",
		}),
	],
});
