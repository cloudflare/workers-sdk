import { fetchResult } from "../../shared/context";
import type { Config, ServiceMetadataRes } from "@cloudflare/workers-utils";

export function withoutMetricsExportConfig(
	observability: Config["observability"]
): Config["observability"] {
	if (observability === undefined || observability.metrics === undefined) {
		return observability;
	}

	const { metrics: _metrics, ...uploadObservability } = observability;

	return Object.keys(uploadObservability).length > 0
		? uploadObservability
		: undefined;
}

type MetricExportResource = {
	resourceType: "workers";
	resourceId: string;
	meta: "self";
	destinations: string[];
};

type MetricExportRequesterPayload = {
	requester: {
		requesterType: "workers";
		requesterId: string;
	};
	resources: MetricExportResource[];
};

export async function reconcileMetricsExportConfig({
	config,
	accountId,
	scriptName,
	envName,
	useServiceEnvironments,
}: {
	config: Config;
	accountId: string;
	scriptName: string;
	envName: string;
	useServiceEnvironments: boolean;
}): Promise<void> {
	const metrics = config.observability?.metrics;

	if (metrics?.enabled === undefined) {
		return;
	}

	const resourceId = metrics.enabled
		? await fetchWorkerScriptId({
				config,
				accountId,
				scriptName,
				envName,
				useServiceEnvironments,
			})
		: scriptName;

	const resources: MetricExportResource[] = metrics.enabled
		? [
				{
					resourceType: "workers",
					resourceId,
					meta: "self",
					destinations: metrics.destinations ?? [],
				},
			]
		: [];

	const payload: MetricExportRequesterPayload = {
		requester: {
			requesterType: "workers",
			requesterId: scriptName,
		},
		resources,
	};

	await fetchResult(
		config,
		`/accounts/${accountId}/workers/observability/metricsexport`,
		{
			method: "POST",
			body: JSON.stringify(payload),
			headers: {
				"Content-Type": "application/json",
			},
		}
	);
}

async function fetchWorkerScriptId({
	config,
	accountId,
	scriptName,
	envName,
	useServiceEnvironments,
}: {
	config: Config;
	accountId: string;
	scriptName: string;
	envName: string;
	useServiceEnvironments: boolean;
}): Promise<string> {
	if (useServiceEnvironments) {
		const serviceEnvironmentMetadata = await fetchResult<
			ServiceMetadataRes["default_environment"]
		>(
			config,
			`/accounts/${accountId}/workers/services/${scriptName}/environments/${envName}`
		);

		return serviceEnvironmentMetadata.script.id;
	}

	const serviceMetadata = await fetchResult<ServiceMetadataRes>(
		config,
		`/accounts/${accountId}/workers/services/${scriptName}`
	);

	return serviceMetadata.default_environment.script.id;
}
