import { CoreBindings } from "../../core";
import { errorResponse, wrapResponse } from "../common";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type { zObservabilityQueryData } from "../generated/zod.gen";
import type { z } from "zod";

// ============================================================================
// Error codes
// ============================================================================

// These are deliberately in their own range, distinct from the generic 10000 /
// 10001 codes used by `app.onError` and the other resource handlers. The UI
// special-cases `OBSERVABILITY_NOT_ENABLED` to show the "enable capture" panel,
// so it must not collide with the code a genuine internal failure would carry
// (otherwise a real error is misread as "capture is off").

/** Local observability isn't enabled, so there's no collector to read from. */
const OBSERVABILITY_NOT_ENABLED = 10130;
/** The collector reported an error (e.g. a rejected read-only query). */
const OBSERVABILITY_COLLECTOR_ERROR = 10131;

type QueryBody = z.output<typeof zObservabilityQueryData.shape.body>;

/**
 * Proxy a request to the internal observability collector's read API and wrap
 * the result in the Cloudflare API envelope. The collector binding is only
 * present when local observability is enabled; otherwise return a clear error.
 */
async function proxyToCollector(
	env: Env,
	path: string,
	init?: RequestInit
): Promise<Response> {
	const collector = env[CoreBindings.SERVICE_OBSERVABILITY_COLLECTOR];
	if (!collector) {
		return errorResponse(
			404,
			OBSERVABILITY_NOT_ENABLED,
			"Local observability is not enabled for this dev session."
		);
	}
	const response = await collector.fetch(`http://collector${path}`, init);
	if (!response.ok) {
		let message = `Observability collector returned ${response.status}`;
		try {
			const body = (await response.json()) as { error?: unknown };
			if (body && typeof body.error === "string") {
				message = body.error;
			}
		} catch {
			// non-JSON error body; keep the status-based message
		}
		const status = response.status === 400 ? 400 : 502;
		return errorResponse(status, OBSERVABILITY_COLLECTOR_ERROR, message);
	}
	return Response.json(wrapResponse(await response.json()));
}

/**
 * POST /local/observability/query — the sole read endpoint. Runs a read-only SQL
 * query (optionally with bound `params`) against the `spans`/`logs` store and
 * returns `{ columns, rows }`. The UI's trace/log views and coding agents all
 * read through here; the store enforces read-only + row-cap guardrails.
 */
export async function runQuery(
	c: AppContext,
	body: QueryBody
): Promise<Response> {
	return proxyToCollector(c.env, "/query", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ sql: body.sql, params: body.params }),
	});
}

/**
 * POST /local/observability/clear — delete all captured spans and logs. Proxies
 * to the collector's mutating `/clear` endpoint (the read-only guardrail only
 * applies to `/query`).
 */
export async function clearTraces(c: AppContext): Promise<Response> {
	return proxyToCollector(c.env, "/clear", { method: "POST" });
}
