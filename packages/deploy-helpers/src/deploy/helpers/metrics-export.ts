import { retryOnAPIFailure, UserError } from "@cloudflare/workers-utils";
import { fetchResult, logger } from "../../shared/context";
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

	try {
		await retryOnAPIFailure(async () => {
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
					requesterId: `${scriptName}/${envName}`,
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
		}, logger);
	} catch (error) {
		const reason =
			error instanceof UserError &&
			error.telemetryMessage === "metrics export script id unavailable"
				? ` ${error.message}`
				: "";
		throw new UserError(
			`The Worker deployment succeeded, but Wrangler could not reconcile its metrics export configuration.${reason} Retry the deployment to reconcile the configuration.`,
			{
				cause: error,
				telemetryMessage: "metrics export reconciliation partial failure",
			}
		);
	}
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

		return validateConstantScriptId(serviceEnvironmentMetadata.script.id);
	}

	const serviceMetadata = await fetchResult<ServiceMetadataRes>(
		config,
		`/accounts/${accountId}/workers/services/${scriptName}`
	);

	return validateConstantScriptId(
		serviceMetadata.default_environment.script.id
	);
}

function validateConstantScriptId(scriptId: string): string {
	const parsedScriptId = Number(scriptId);
	if (!Number.isSafeInteger(parsedScriptId) || parsedScriptId <= 0) {
		throw new UserError(
			"The Workers API did not return the numeric script ID required for metrics export.",
			{
				telemetryMessage: "metrics export script id unavailable",
			}
		);
	}

	return scriptId;
}
