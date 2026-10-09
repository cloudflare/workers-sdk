import { convertToWranglerConfig, InputWorkerSchema } from "@cloudflare/config";
import { defu } from "defu";
import * as z from "zod";
import type { ParsedInputWorkerConfig } from "@cloudflare/config";
import type { Config } from "@cloudflare/workers-utils";

export type WranglerWorkerConfig = Pick<
	Config,
	"main" | "compatibility_date" | "compatibility_flags"
> & {
	durable_objects: {
		bindings: Omit<
			Config["durable_objects"]["bindings"][number],
			"environment"
		>[];
	};
};

export type WranglerWorkerConfigCustomizer =
	| Partial<WranglerWorkerConfig>
	| ((config: WranglerWorkerConfig) => Partial<WranglerWorkerConfig> | void);

const WranglerWorkerConfigSchema = z.strictObject({
	main: InputWorkerSchema.shape.entrypoint,
	compatibility_date: InputWorkerSchema.shape.compatibilityDate,
	compatibility_flags: InputWorkerSchema.shape.compatibilityFlags,
	durable_objects: z.strictObject({
		bindings: z.array(
			z.strictObject({
				name: z.string(),
				class_name: z.string(),
				script_name: z.string().optional(),
			})
		),
	}),
});

export function customizeWranglerWorkerConfig(
	workerConfig: ParsedInputWorkerConfig,
	customizer: WranglerWorkerConfigCustomizer
): ParsedInputWorkerConfig {
	const rawConfig = convertToWranglerConfig({
		worker: workerConfig,
		containers: [],
	});
	const wranglerConfig: WranglerWorkerConfig = {
		main: rawConfig.main,
		compatibility_date: rawConfig.compatibility_date,
		compatibility_flags: [...(rawConfig.compatibility_flags ?? [])],
		durable_objects: {
			bindings: (rawConfig.durable_objects?.bindings ?? [])
				.filter(
					({ name }) => workerConfig.env?.[name]?.type === "durable-object"
				)
				.map(({ script_name, ...binding }) => ({
					...binding,
					...(script_name === workerConfig.name ? {} : { script_name }),
				})),
		},
	};
	const result =
		typeof customizer === "function" ? customizer(wranglerConfig) : customizer;
	const config = WranglerWorkerConfigSchema.parse(
		result ? defu(result, wranglerConfig) : wranglerConfig
	);
	const env = { ...workerConfig.env };

	for (const [name, binding] of Object.entries(env)) {
		if (binding.type === "durable-object") {
			delete env[name];
		}
	}

	for (const binding of config.durable_objects.bindings) {
		if (env[binding.name] !== undefined) {
			throw new Error(
				`Wrangler customizer binding "${binding.name}" conflicts with another binding.`
			);
		}

		env[binding.name] = {
			type: "durable-object",
			worker: binding.script_name ?? workerConfig.name,
			exportName: binding.class_name,
		};
	}

	return InputWorkerSchema.parse({
		...workerConfig,
		entrypoint: config.main,
		compatibilityDate: config.compatibility_date,
		compatibilityFlags: config.compatibility_flags,
		env,
	});
}
