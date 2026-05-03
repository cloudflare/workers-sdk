import { NO_AGGREGATE_HEADER } from "./aggregation";
import { getRouteName } from "./route-names";
import type { AppContext } from "./common";
import type { Next } from "hono";

export { getRouteName };

const SPARROW_URL = "https://sparrow.cloudflare.com";

// Injected at build time
declare const SPARROW_SOURCE_KEY: string;

interface TelemetryEvent {
	event: string;
	deviceId: string;
	timestamp: number;
	properties: Record<string, unknown>;
}

function sendTelemetryEvent(
	deviceId: string,
	event: string,
	properties: Record<string, unknown>
): Promise<void> {
	const body: TelemetryEvent = {
		event,
		deviceId,
		timestamp: Date.now(),
		properties,
	};

	return fetch(`${SPARROW_URL}/api/v1/event`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"Sparrow-Source-Key": SPARROW_SOURCE_KEY,
		},
		body: JSON.stringify(body),
	}).then(
		() => {},
		// fail silently
		() => {}
	);
}

export async function telemetryMiddleware(
	c: AppContext,
	next: Next
): Promise<void> {
	await next();

	if (
		!c.res.ok ||
		!SPARROW_SOURCE_KEY ||
		!c.env.MINIFLARE_TELEMETRY_CONFIG.enabled ||
		// Skip telemetry for aggregation calls between instances
		c.req.raw.headers.has(NO_AGGREGATE_HEADER) ||
		!c.env.MINIFLARE_TELEMETRY_CONFIG.deviceId
	) {
		return;
	}

	const route = `${getRouteName(c.req.path)}.${c.req.method.toLowerCase()}`;
	const userAgent = c.req.header("User-Agent") ?? "unknown";

	// Base properties for all routes
	const properties: Record<string, unknown> = {
		userAgent,
	};

	// Special handling for GET /local/workers - add binding counts
	if (route === "local.workers.get") {
		try {
			const clonedResponse = c.res.clone();
			const data = (await clonedResponse.json()) as {
				result?: Array<{ bindings?: Record<string, unknown[]> }>;
			};
			const workers = data.result ?? [];

			let kvCount = 0;
			let d1Count = 0;
			let r2Count = 0;
			let doCount = 0;
			let workflowsCount = 0;
			for (const worker of workers) {
				if (worker.bindings) {
					kvCount += worker.bindings.kv?.length ?? 0;
					d1Count += worker.bindings.d1?.length ?? 0;
					r2Count += worker.bindings.r2?.length ?? 0;
					doCount += worker.bindings.do?.length ?? 0;
					workflowsCount += worker.bindings.workflows?.length ?? 0;
				}
			}
			properties.workerCount = workers.length;
			properties.kvCount = kvCount;
			properties.d1Count = d1Count;
			properties.r2Count = r2Count;
			properties.doCount = doCount;
			properties.workflowsCount = workflowsCount;
		} catch {}
	}

	const telemetryPromise = sendTelemetryEvent(
		c.env.MINIFLARE_TELEMETRY_CONFIG.deviceId,
		`localapi.${route}`,
		properties
	);

	// Use waitUntil to keep the Worker alive until the telemetry fetch completes
	c.executionCtx.waitUntil(telemetryPromise);
}
