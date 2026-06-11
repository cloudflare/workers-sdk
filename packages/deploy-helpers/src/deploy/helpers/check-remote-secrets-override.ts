import { fetchResult } from "../../shared/context";
import { useServiceEnvironments } from "./use-service-environments";
import { isWorkerNotFoundError } from "./worker-not-found-error";
import type { Config } from "@cloudflare/workers-utils";

export async function fetchSecrets(
	config: Config,
	accountId: string,
	environment: string | undefined
): Promise<{ name: string; type: string }[]> {
	const isServiceEnv = environment && useServiceEnvironments(config);

	const scriptName = config.name;

	const url = isServiceEnv
		? `/accounts/${accountId}/workers/services/${scriptName}/environments/${environment}/secrets`
		: `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`;

	return fetchResult<{ name: string; type: string }[]>(config, url);
}

export async function checkRemoteSecretsOverride(
	config: Config,
	accountId: string,
	targetEnv: string | undefined
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
		const secretNames = new Set<string>();

		try {
			const secrets = await fetchSecrets(config, accountId, targetEnv);

			for (const secret of secrets) {
				secretNames.add(secret.name);
			}
		} catch (e) {
			if (isWorkerNotFoundError(e)) {
				return { override: false };
			}
			throw e;
		}

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
			case "ai_search_namespaces":
			case "ai_search":
			case "agent_memory":
			case "services":
			case "mtls_certificates":
			case "dispatch_namespaces":
			case "vpc_services":
			case "vpc_networks": {
				const value: Config[typeof key] = untypedValue;
				return (value ?? []).map((workflowBinding) => workflowBinding.binding);
			}
			case "browser":
			case "ai":
			case "websearch": {
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
