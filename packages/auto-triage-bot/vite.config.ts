import { cloudflare } from "@cloudflare/vite-plugin";
import { flue, flueWorkerConfig } from "@flue/vite";
import { defineConfig } from "vite";
import type { WorkerConfig } from "@cloudflare/vite-plugin/experimental-config";

function adaptFlueWorkerConfig() {
	const customizeFlueWorkerConfig = flueWorkerConfig();

	return (config: WorkerConfig) => {
		const env = (config.env ??= {});
		const durableObjectBindings = [];
		for (const [name, binding] of Object.entries(env)) {
			if (binding.type !== "durable-object") {
				continue;
			}
			durableObjectBindings.push({
				name,
				class_name: binding.exportName,
				...(binding.worker === config.name
					? {}
					: { script_name: binding.worker }),
			});
		}
		const legacyConfig = {
			compatibility_date: config.compatibilityDate,
			compatibility_flags: config.compatibilityFlags,
			main: config.entrypoint,
			durable_objects: { bindings: durableObjectBindings },
		};

		customizeFlueWorkerConfig(legacyConfig);

		config.compatibilityFlags = legacyConfig.compatibility_flags;
		config.entrypoint = legacyConfig.main;
		for (const binding of legacyConfig.durable_objects.bindings) {
			if (binding.script_name !== undefined) {
				continue;
			}
			env[binding.name] ??= {
				type: "durable-object",
				worker: config.name,
				exportName: binding.class_name,
			};
			config.exports ??= {};
			config.exports[binding.class_name] ??= {
				type: "durable-object",
				storage: "sqlite",
			};
		}
	};
}

export default defineConfig({
	plugins: [
		flue({
			providers: ["cloudflare"],
		}),
		cloudflare({
			config: adaptFlueWorkerConfig(),
		}),
	],
});
