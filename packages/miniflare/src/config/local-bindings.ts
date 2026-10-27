import type { WorkerOptions } from "./schema";
import type { ParsedInputWorkerConfig } from "@cloudflare/config";

type MiniflareEnv = NonNullable<WorkerOptions["config"]["env"]>;

export interface ResolveLocalBindingsOptions {
	/** Name of the Worker, used in the missing secrets warning. */
	workerName: string;
	/** Values resolved from `.env` files and the process environment. */
	localEnv: Record<string, string>;
	/**
	 * Values from the selected `.dev.vars` file, which are used exclusively when
	 * provided.
	 */
	devVars?: Record<string, string>;
	/** The mode, used to name mode-specific files in the missing secrets warning. */
	mode: string;
	/** Whether remote binding sessions are enabled. Defaults to `true`. */
	remoteBindings?: boolean;
	/** Receives the warning about declared secrets without a local value. */
	logger: { warn(message: string): void };
}

/**
 * Resolves local binding values from the loaded local env. This replaces
 * declared secret placeholders with text bindings and applies Hyperdrive
 * connection-string overrides. Missing secrets are omitted, with a warning, so
 * Miniflare doesn't receive an unresolved deployment-only placeholder.
 *
 * @param configuredBindings The Worker's configured bindings.
 * @param options Where local values come from, and how to report missing ones.
 * @returns The complete bindings.
 */
export function resolveLocalBindings(
	configuredBindings: ParsedInputWorkerConfig["env"],
	options: ResolveLocalBindingsOptions
): NonNullable<WorkerOptions["config"]["env"]> {
	const { localEnv, devVars, mode, remoteBindings = true } = options;
	const bindings: MiniflareEnv = {};
	const missingSecrets: string[] = [];
	const localValues = devVars ?? localEnv;

	for (const [name, binding] of Object.entries(configuredBindings ?? {})) {
		if (binding.type === "hyperdrive") {
			if (binding.dev?.remote && remoteBindings) {
				bindings[name] = { ...binding, dev: binding.dev };
				continue;
			}
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

	if (missingSecrets.length > 0) {
		options.logger.warn(
			`Missing required secrets for Worker "${options.workerName}": ${missingSecrets.join(", ")}. ` +
				`Add them to one of \`.dev.vars.${mode}\`, \`.dev.vars\`, ` +
				`\`.env.${mode}.local\`, \`.env.${mode}\`, \`.env.local\`, or \`.env\`. ` +
				"Alternatively, set them as environment variables."
		);
	}

	return bindings;
}
