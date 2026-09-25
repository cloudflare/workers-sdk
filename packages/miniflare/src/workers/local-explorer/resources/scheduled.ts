import { CoreBindings } from "../../core";
import { dispatchScheduled } from "../../core/scheduled";
import { fetchFromPeer, NO_AGGREGATE_HEADER } from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import {
	zLocalExplorerDispatchScheduledResponse,
	zWorkersApiResponseCommonFailure,
} from "../generated/zod.gen";
import type { WorkerRegistry } from "../../../shared/dev-registry-types";
import type { AppContext } from "../common";
import type { zLocalExplorerDispatchScheduledData } from "../generated/zod.gen";
import type { z } from "zod";

const SCHEDULED_ERROR_CODE = 10000;

type ScheduledQuery = z.output<
	NonNullable<typeof zLocalExplorerDispatchScheduledData.shape.query>
>;
type ScheduledBody = z.output<
	typeof zLocalExplorerDispatchScheduledData.shape.body
>;

function isFetcher(value: unknown): value is Fetcher {
	return (
		typeof value === "object" &&
		value !== null &&
		"scheduled" in value &&
		typeof value.scheduled === "function"
	);
}

function getUserWorkerService(
	c: AppContext,
	worker: string
): Fetcher | undefined {
	const service =
		c.env[`${CoreBindings.SERVICE_EXPLORER_USER_WORKER_PREFIX}${worker}`];
	return isFetcher(service) ? service : undefined;
}

function peerUnavailable(message: string): Response {
	return errorResponse(502, SCHEDULED_ERROR_CODE, message);
}

async function dispatchLocalScheduled(
	c: AppContext,
	worker: string,
	body: ScheduledBody
): Promise<Response> {
	const service = getUserWorkerService(c, worker);
	if (service === undefined) {
		return peerUnavailable(`The owner of Worker "${worker}" is unavailable.`);
	}

	try {
		const result = await dispatchScheduled(service, {
			cron: body.cron,
			scheduledTime:
				body.scheduled_time === undefined
					? undefined
					: new Date(body.scheduled_time),
		});
		// Fetcher results are RPC-backed objects. Round-trip them before nesting
		// in the API envelope so all serializable result fields are retained.
		const plainResult = JSON.parse(JSON.stringify(result)) as unknown;
		return Response.json(wrapResponse(plainResult));
	} catch (error) {
		const message =
			error instanceof Error
				? error.message
				: `Failed to dispatch Worker "${worker}".`;
		return errorResponse(500, SCHEDULED_ERROR_CODE, message);
	}
}

async function decodePeerResponse(
	response: Response | null,
	worker: string
): Promise<Response> {
	if (response === null) {
		return peerUnavailable(`The owner of Worker "${worker}" is unavailable.`);
	}

	let payload: unknown;
	try {
		payload = await response.json();
	} catch {
		return peerUnavailable(
			`The owner of Worker "${worker}" returned an invalid response.`
		);
	}

	if (response.status === 200) {
		if (!zLocalExplorerDispatchScheduledResponse.safeParse(payload).success) {
			return peerUnavailable(
				`The owner of Worker "${worker}" returned an invalid response.`
			);
		}
		return Response.json(payload);
	}

	if (
		(response.status === 500 || response.status === 502) &&
		zWorkersApiResponseCommonFailure.safeParse(payload).success
	) {
		return Response.json(payload, { status: response.status });
	}

	return peerUnavailable(`The owner of Worker "${worker}" is unavailable.`);
}

/** Dispatches a scheduled invocation to the exact Worker available to Local Explorer. */
export async function dispatchScheduledToWorker(
	c: AppContext,
	query: ScheduledQuery,
	body: ScheduledBody
): Promise<Response> {
	const forwarded = c.req.raw.headers.has(NO_AGGREGATE_HEADER);
	const registryResponse = await c.env[CoreBindings.SERVICE_LOOPBACK].fetch(
		"http://localhost/core/dev-registry"
	);
	const registry = (await registryResponse.json()) as WorkerRegistry;
	const selfInstanceId = registryResponse.headers.get(
		"X-Miniflare-Dev-Registry-Instance-Id"
	);
	const owner = registry[query.worker];

	if (owner === undefined) {
		if (
			!forwarded &&
			c.env[CoreBindings.JSON_LOCAL_EXPLORER_WORKER_NAMES].includes(
				query.worker
			)
		) {
			return dispatchLocalScheduled(c, query.worker, body);
		}
		return forwarded
			? peerUnavailable(`This instance does not own Worker "${query.worker}".`)
			: errorResponse(
					404,
					SCHEDULED_ERROR_CODE,
					`Worker "${query.worker}" is not registered.`
				);
	}

	if (owner.instanceId === selfInstanceId) {
		return dispatchLocalScheduled(c, query.worker, body);
	}

	if (forwarded) {
		return peerUnavailable(
			`This instance does not own Worker "${query.worker}".`
		);
	}

	const params = new URLSearchParams({ worker: query.worker });
	const response = await fetchFromPeer(
		owner.debugPortAddress,
		`/local/scheduled?${params}`,
		{
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
		}
	);
	return decodePeerResponse(response, query.worker);
}
