import { defineConfig, defineWorker } from "../definition";
import { triggers } from "../triggers";
import type { InferCrons, UnwrapConfig } from "../inference";

type Equal<T, U> =
	(<V>() => V extends T ? 1 : 2) extends <V>() => V extends U ? 1 : 2
		? true
		: false;
type Assert<T extends true> = T;

type ConfigCrons<TConfig> = InferCrons<
	UnwrapConfig<UnwrapConfig<TConfig> extends { worker: infer W } ? W : never>
>;

const helperConfig = defineConfig({
	worker: {
		name: "helper-worker",
		compatibilityDate: "2026-11-25",
		triggers: [
			triggers.fetch({ pattern: "example.com/*" }),
			triggers.queue({ name: "jobs" }),
			triggers.scheduled({ schedule: "0 * * * *" }),
			triggers.scheduled({ schedule: "30 0 * * *" }),
		],
	},
});
export type HelperCronsTest = Assert<
	Equal<ConfigCrons<typeof helperConfig>, "0 * * * *" | "30 0 * * *">
>;

const scheduledTrigger = triggers.scheduled({ schedule: "*/5 * * * *" });
export type HelperScheduleLiteralTest = Assert<
	Equal<typeof scheduledTrigger.schedule, "*/5 * * * *">
>;

const handWrittenConfig = defineConfig({
	worker: {
		name: "hand-written-worker",
		compatibilityDate: "2026-11-25",
		triggers: [
			{ type: "fetch", pattern: "example.com/*" },
			{ type: "scheduled", schedule: "0 0 * * *" },
		],
	},
});
export type HandWrittenCronsTest = Assert<
	Equal<ConfigCrons<typeof handWrittenConfig>, "0 0 * * *">
>;

const branchedConfig = defineConfig((ctx) =>
	ctx.isPreview
		? {
				worker: {
					name: "preview-worker",
					compatibilityDate: "2026-11-25",
				},
			}
		: {
				worker: {
					name: "production-worker",
					compatibilityDate: "2026-11-25",
					triggers: [
						triggers.scheduled({ schedule: "0 0 * * *" }),
						...(ctx.mode === "production"
							? [triggers.scheduled({ schedule: "*/10 * * * *" })]
							: []),
					],
				},
			}
);
export type BranchedCronsTest = Assert<
	Equal<ConfigCrons<typeof branchedConfig>, "0 0 * * *" | "*/10 * * * *">
>;

const asyncWorkerConfig = defineConfig({
	worker: defineWorker(async () => ({
		name: "async-worker",
		compatibilityDate: "2026-11-25",
		triggers: [triggers.scheduled({ schedule: "15 * * * *" })],
	})),
});
export type AsyncWorkerCronsTest = Assert<
	Equal<ConfigCrons<typeof asyncWorkerConfig>, "15 * * * *">
>;

declare const dynamicSchedule: string;
const dynamicConfig = defineConfig({
	worker: {
		name: "dynamic-worker",
		compatibilityDate: "2026-11-25",
		triggers: [
			triggers.scheduled({ schedule: "0 0 * * *" }),
			triggers.scheduled({ schedule: dynamicSchedule }),
		],
	},
});
export type DynamicCronsTest = Assert<
	Equal<ConfigCrons<typeof dynamicConfig>, string>
>;

const noScheduledConfig = defineConfig({
	worker: {
		name: "fetch-only-worker",
		compatibilityDate: "2026-11-25",
		triggers: [triggers.fetch({ pattern: "example.com/*" })],
	},
});
export type NoScheduledCronsTest = Assert<
	Equal<ConfigCrons<typeof noScheduledConfig>, string>
>;

const noTriggersConfig = defineConfig({
	worker: {
		name: "no-triggers-worker",
		compatibilityDate: "2026-11-25",
	},
});
export type NoTriggersCronsTest = Assert<
	Equal<ConfigCrons<typeof noTriggersConfig>, string>
>;
