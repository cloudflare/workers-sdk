import {
	APIError,
	retryOnAPIFailure,
	UserError,
} from "@cloudflare/workers-utils";
import { fetchResult, logger } from "../../shared/context";
import { extractBindingsOfType } from "./binding-utils";
import { getSettings } from "./provision-bindings";
import type {
	Binding,
	ComplianceConfig,
	Config,
	WorkerMetadataBinding,
} from "@cloudflare/workers-utils";

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
	resourceType: "workers" | "d1" | "r2";
	resourceId: string;
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
	bindings,
}: {
	config: Config;
	accountId: string;
	scriptName: string;
	bindings: Record<string, Binding>;
}): Promise<void> {
	const metrics = config.observability?.metrics;

	if (metrics?.enabled === undefined) {
		return;
	}

	try {
		const resources = metrics.enabled
			? await discoverMetricsExportResources({
					config,
					accountId,
					scriptName,
					bindings,
					destinations: metrics.destinations ?? [],
				})
			: [];

		await postMetricsExportRequester(config, accountId, scriptName, resources);
	} catch (error) {
		if (error instanceof UserError && !(error instanceof APIError)) {
			throw error;
		}
		throw new UserError(
			"The Worker deployment succeeded, but Wrangler could not reconcile its metrics export configuration. Retry the deployment to reconcile the configuration.",
			{
				cause: error,
				telemetryMessage: "metrics export reconciliation partial failure",
			}
		);
	}
}

export async function clearMetricsExportRequester({
	config,
	accountId,
	scriptName,
}: {
	config: ComplianceConfig;
	accountId: string;
	scriptName: string;
}): Promise<void> {
	try {
		await postMetricsExportRequester(config, accountId, scriptName, []);
	} catch (error) {
		throw new UserError(
			"Wrangler could not clean up this Worker's metrics export configuration, so the Worker was not deleted. Retry the delete command.",
			{
				cause: error,
				telemetryMessage: "metrics export delete cleanup failure",
			}
		);
	}
}

async function discoverMetricsExportResources({
	config,
	accountId,
	scriptName,
	bindings,
	destinations,
}: {
	config: Config;
	accountId: string;
	scriptName: string;
	bindings: Record<string, Binding>;
	destinations: string[];
}): Promise<MetricExportResource[]> {
	const d1Bindings = extractBindingsOfType("d1", bindings);
	const r2Bindings = extractBindingsOfType("r2_bucket", bindings);
	const needsSettings =
		d1Bindings.some(({ database_id }) => typeof database_id !== "string") ||
		r2Bindings.some(({ bucket_name }) => typeof bucket_name !== "string");
	const remoteBindings = needsSettings
		? (await getSettings(config, accountId, scriptName)).bindings
		: [];
	const d1Ids = new Set<string>();
	const r2Names = new Set<string>();

	for (const binding of d1Bindings) {
		const resourceId =
			typeof binding.database_id === "string"
				? binding.database_id
				: findRemoteD1Id(remoteBindings, binding.binding);
		if (!resourceId) {
			throw unresolvedBindingError("D1", binding.binding);
		}
		d1Ids.add(resourceId);
	}

	for (const binding of r2Bindings) {
		const resourceId =
			typeof binding.bucket_name === "string"
				? binding.bucket_name
				: findRemoteR2BucketName(remoteBindings, binding.binding);
		if (!resourceId) {
			throw unresolvedBindingError("R2", binding.binding);
		}
		r2Names.add(resourceId);
	}

	return [
		{ resourceType: "workers", resourceId: scriptName, destinations },
		...[...d1Ids].sort().map((resourceId) => ({
			resourceType: "d1" as const,
			resourceId,
			destinations,
		})),
		...[...r2Names].sort().map((resourceId) => ({
			resourceType: "r2" as const,
			resourceId,
			destinations,
		})),
	];
}

function findRemoteD1Id(
	bindings: WorkerMetadataBinding[],
	bindingName: string
): string | undefined {
	const binding = bindings.find(
		(candidate) => candidate.type === "d1" && candidate.name === bindingName
	);
	return binding?.type === "d1" ? binding.id : undefined;
}

function findRemoteR2BucketName(
	bindings: WorkerMetadataBinding[],
	bindingName: string
): string | undefined {
	const binding = bindings.find(
		(candidate) =>
			candidate.type === "r2_bucket" && candidate.name === bindingName
	);
	return binding?.type === "r2_bucket" ? binding.bucket_name : undefined;
}

function unresolvedBindingError(resourceType: "D1" | "R2", binding: string) {
	return new UserError(
		`Wrangler could not resolve the ${resourceType} resource used by binding ${binding}.`,
		{
			telemetryMessage: "metrics export binding resolution failed",
		}
	);
}

async function postMetricsExportRequester(
	config: ComplianceConfig,
	accountId: string,
	scriptName: string,
	resources: MetricExportResource[]
): Promise<void> {
	const payload: MetricExportRequesterPayload = {
		requester: {
			requesterType: "workers",
			requesterId: scriptName,
		},
		resources,
	};

	await retryOnAPIFailure(
		() =>
			fetchResult(
				config,
				`/accounts/${accountId}/workers/observability/metricsexport`,
				{
					method: "POST",
					body: JSON.stringify(payload),
					headers: {
						"Content-Type": "application/json",
					},
				}
			),
		logger
	);
}
