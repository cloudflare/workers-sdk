import type { ParsedInputWorkerConfig } from "@cloudflare/config";
import type { WorkerOptions } from "miniflare";

type MiniflareEnv = NonNullable<WorkerOptions["config"]["env"]>;

export interface ResolvedLocalBindings {
	bindings: MiniflareEnv;
	missingSecrets: string[];
}

/**
 * Resolves local binding values from the loaded local env. This replaces
 * declared secret placeholders with text bindings and applies Hyperdrive
 * connection-string overrides. Missing secrets are omitted so Miniflare
 * doesn't receive an unresolved deployment-only placeholder.
 *
 * @param configuredBindings The Worker's configured bindings.
 * @param localEnv Values resolved from `.env` files and the process environment.
 * @param devVars Values from the selected `.dev.vars` file, which are used exclusively when provided.
 * @returns The complete bindings and any secrets missing a local value.
 */
export function resolveLocalBindings(
	configuredBindings: ParsedInputWorkerConfig["env"],
	localEnv: Record<string, string>,
	devVars?: Record<string, string>
): ResolvedLocalBindings {
	const bindings: MiniflareEnv = {};
	const missingSecrets: string[] = [];
	const localValues = devVars ?? localEnv;

	for (const [name, binding] of Object.entries(configuredBindings ?? {})) {
		if (binding.type === "hyperdrive") {
			const connectionString =
				localEnv[`CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_${name}`] ||
				binding.dev?.connectionString;
			if (connectionString === undefined) {
				throw new Error(
					`Hyperdrive binding "${name}" must define dev.connectionString for local development.`
				);
			}
			bindings[name] = {
				...binding,
				dev: { ...binding.dev, connectionString },
			};
			continue;
		}

		if (binding.type === "secret") {
			const localValue = localValues[name];
			if (localValue !== undefined) {
				bindings[name] = { type: "text", value: localValue };
			} else {
				missingSecrets.push(name);
			}
			continue;
		}

		bindings[name] = binding;
	}

	return { bindings, missingSecrets };
}
