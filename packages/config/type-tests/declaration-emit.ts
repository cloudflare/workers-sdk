/**
 * Declaration-emit type test.
 *
 * This file stands in for a user's `cloudflare.config.ts` inside a package
 * compiled with `declaration: true`. Every authoring helper's return type must
 * be nameable from the public entry point, otherwise `tsc` fails with:
 *
 *   error TS4023: Exported variable 'settings' has or is using name
 *   'DEFINITION' from external module "…" but cannot be named.
 *
 * The imports deliberately go through the published `@cloudflare/config/public`
 * entry point (rather than `../src/public`) so that the bundled `.d.mts`
 * produced by `tsdown` is exercised too.
 */

import {
	bindings,
	defineSettings,
	defineWorker,
	exports as configExports,
	triggers,
} from "@cloudflare/config/public";
import type { SettingsConfig } from "@cloudflare/config/public";

export const settings = defineSettings({
	accountId: "0000000000000000000000000000000",
	complianceRegion: "public",
});

// The hand-authored form is explicitly supported and must keep working.
export const handAuthoredSettings = {
	type: "settings",
	complianceRegion: "fedramp-high",
} satisfies SettingsConfig;

export const settingsFromFunction = defineSettings((ctx) => ({
	complianceRegion: ctx.mode === "production" ? "fedramp-high" : "public",
}));

export const workerBindings = {
	MY_KV: bindings.kv({ id: "kv-id" }),
	MY_TEXT: bindings.text("hello"),
	MY_R2: bindings.r2({ name: "my-bucket" }),
};

export const workerTriggers = [
	triggers.scheduled({ schedule: "0 * * * *" }),
	triggers.queue({ name: "my-queue" }),
];

export const workerExports = {
	MyDurableObject: configExports.durableObject({ storage: "sqlite" }),
	MyEntrypoint: configExports.worker(),
};

export default defineWorker({
	name: "declaration-emit-type-test",
	compatibilityDate: "2026-05-18",
	entrypoint: "./index.ts",
	env: workerBindings,
	triggers: workerTriggers,
	exports: workerExports,
});
