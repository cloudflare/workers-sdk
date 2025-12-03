import { fetchSecrets } from "../utils/fetch-secrets";
import type { Config } from "@cloudflare/workers-utils";

/**
 * Checks whether some remote secrets would be overridden by either some env variable or binding names.
 *
 * @param config The resolved config
 * @param targetEnv The target environment if any
 * @returns object with an `override` flag indicating whether there are overrides, if there are a error message for `wrangler deploy` is also returned
 */
export async function checkRemoteSecretsOverride(
	config: Config,
	targetEnv?: string
): Promise<
	| {
			override: false;
	  }
	| {
			override: true;
			deployErrorMessage: string;
	  }
> {
	const envVarNames = Object.keys(config.vars ?? {});
	const bindingNames = extractBindingNames(config);

	if (envVarNames.length + bindingNames.length > 0) {
		const secrets = await fetchSecrets(config, targetEnv);
		const secretNames = new Set(secrets.map((secret) => secret.name));

		const envVarNamesOverridingSecrets = envVarNames.filter((name) =>
			secretNames.has(name)
		);

		const bindingNamesOverridingSecrets = bindingNames.filter((name) =>
			secretNames.has(name)
		);

		if (
			envVarNamesOverridingSecrets.length +
				bindingNamesOverridingSecrets.length ===
			0
		) {
			return { override: false };
		}

		if (
			envVarNamesOverridingSecrets.length &&
			!bindingNamesOverridingSecrets.length
		) {
			return {
				override: true,
				deployErrorMessage: constructSingleTypeDeployErrorMessage(
					envVarNamesOverridingSecrets,
					"variable"
				),
			};
		}

		if (
			bindingNamesOverridingSecrets.length &&
			!envVarNamesOverridingSecrets.length
		) {
			return {
				override: true,
				deployErrorMessage: constructSingleTypeDeployErrorMessage(
					bindingNamesOverridingSecrets,
					"binding"
				),
			};
		}

		const affectedSecrets = [
			...envVarNamesOverridingSecrets,
			...bindingNamesOverridingSecrets,
		];

		return {
			override: true,
			deployErrorMessage: `Configuration values (${listNames(affectedSecrets)}) conflict with existing remote secrets. This deployment will replace these remote secrets with the configuration values.`,
		};
	}

	return { override: false };
}

function extractBindingNames(config: Config): string[] {
	return Object.entries(config).flatMap((entry) => {
		const key = entry[0] as keyof Config;
		const untypedValue = entry[1];

		switch (key) {
			case "durable_objects": {
				const value: Config[typeof key] = untypedValue;
				return value.bindings.map((doBinding) => doBinding.name);
			}
			case "workflows":
			case "d1_databases":
			case "kv_namespaces":
			case "r2_buckets":
			case "vectorize":
			case "services":
			case "mtls_certificates":
			case "dispatch_namespaces":
			case "vpc_services": {
				const value: Config[typeof key] = untypedValue;
				return (value ?? []).map((workflowBinding) => workflowBinding.binding);
			}
			case "browser":
			case "ai": {
				const value: Config[typeof key] = untypedValue;
				return value ? [value.binding] : [];
			}
			case "queues": {
				const value: Config[typeof key] = untypedValue;
				return (value.producers ?? []).map(
					(queueProducer) => queueProducer.binding
				);
			}
			default:
				return [];
		}
	});
}

function listNames(names: string[]): string {
	if (names.length <= 1) {
		return `\`${names[0]}\``;
	}

	if (names.length == 2) {
		return `\`${names[0]}\` and \`${names[1]}\``;
	}

	return `${names
		.slice(0, -1)
		.map((name) => `\`${name}\`, `)
		.join("")}and \`${names.at(-1)}\``;
}

function constructSingleTypeDeployErrorMessage(
	names: string[],
	type: "variable" | "binding"
) {
	const multiple = names.length > 1;

	const conflictMessage = `${type === "variable" ? "Environment variable" : "Binding"}${multiple ? "s" : ""} ${listNames(names)} conflict${multiple ? "" : "s"} with ${multiple ? "" : "an "}existing remote secret${multiple ? "s" : ""}.`;

	const deploymentMessage = `This deployment will replace ${multiple ? "these" : "the"} remote secret${multiple ? "s" : ""} with your ${type === "variable" ? "environment variable" : "binding"}${multiple ? "s" : ""}.`;

	return `${conflictMessage} ${deploymentMessage}`;
}
