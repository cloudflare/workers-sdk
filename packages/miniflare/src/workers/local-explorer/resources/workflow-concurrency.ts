import { CoreBindings } from "../../core";
import { errorResponse, wrapResponse } from "../common";
import type { AppContext } from "../common";
import type { zWorkflowsListConcurrencyKeysData } from "../generated/zod.gen";
import type { ConcurrencyKeys } from "@cloudflare/workflows-shared/src/concurrency";
import type { z } from "zod";

// Must match `CONCURRENCY_KEYS_OBJECT_NAME` in workflows-shared; importing it would bundle
// the coordinator's Durable Object class into the explorer.
const CONCURRENCY_KEYS_OBJECT_NAME = "concurrency-keys";

// Production's status and error codes, so a tool written against the deployed API, such
// as `wrangler workflows concurrency`, handles local errors the same way.
const ERRORS: Record<string, [status: 400 | 404 | 409, code: number]> = {
	"concurrency_key.not_found": [404, 10700],
	"concurrency_key.already_exists": [409, 10701],
	body: [400, 10001],
};

type ListConcurrencyKeysQuery = NonNullable<
	z.output<typeof zWorkflowsListConcurrencyKeysData>["query"]
>;

function getConcurrencyKeys(
	c: AppContext
): DurableObjectStub<ConcurrencyKeys> | undefined {
	const namespace = c.env[
		CoreBindings.DURABLE_OBJECT_NAMESPACE_WORKFLOW_CONCURRENCY_KEYS
	] as DurableObjectNamespace<ConcurrencyKeys> | undefined;
	return namespace?.get(namespace.idFromName(CONCURRENCY_KEYS_OBJECT_NAME));
}

function noWorkflows(): Response {
	return errorResponse(
		404,
		10700,
		"Concurrency keys are available once a Worker in this session defines a Workflow."
	);
}

// The coordinator throws `WorkflowError("(<code>) <message>")`, and the code is all that
// survives RPC reliably, so it is parsed back out of the message here.
function toErrorResponse(error: unknown): Response {
	const message = error instanceof Error ? error.message : String(error);
	const match = /\(([a-z_.]+)\) (.*)$/.exec(message);
	const mapped = match === null ? undefined : ERRORS[match[1]];
	if (match !== null && mapped !== undefined) {
		return errorResponse(mapped[0], mapped[1], match[2]);
	}
	return errorResponse(500, 10001, message);
}

export async function listConcurrencyKeys(
	c: AppContext,
	query: ListConcurrencyKeysQuery
): Promise<Response> {
	const { page = 1, per_page: perPage = 25 } = query;
	const stub = getConcurrencyKeys(c);
	const keys = stub === undefined ? [] : await stub.listKeys();
	const pageKeys = keys.slice((page - 1) * perPage, page * perPage);
	return c.json({
		...wrapResponse(pageKeys),
		result_info: {
			count: pageKeys.length,
			page,
			per_page: perPage,
			total_count: keys.length,
			total_pages: Math.ceil(keys.length / perPage),
		},
	});
}

export async function createConcurrencyKey(
	c: AppContext,
	body: { name: string; limit: number }
): Promise<Response> {
	const stub = getConcurrencyKeys(c);
	if (stub === undefined) {
		return noWorkflows();
	}
	try {
		return c.json(wrapResponse(await stub.createKey(body.name, body.limit)));
	} catch (error) {
		return toErrorResponse(error);
	}
}

export async function getConcurrencyKey(
	c: AppContext,
	keyId: string
): Promise<Response> {
	const stub = getConcurrencyKeys(c);
	if (stub === undefined) {
		return noWorkflows();
	}
	const key = await stub.getKey(keyId);
	if (key === undefined) {
		return errorResponse(
			404,
			10700,
			`concurrency key '${keyId}' does not exist`
		);
	}
	return c.json(wrapResponse({ ...key, referencing_workflows: [] }));
}

export async function updateConcurrencyKey(
	c: AppContext,
	keyId: string,
	body: { limit: number }
): Promise<Response> {
	const stub = getConcurrencyKeys(c);
	if (stub === undefined) {
		return noWorkflows();
	}
	try {
		return c.json(wrapResponse(await stub.updateKey(keyId, body.limit)));
	} catch (error) {
		return toErrorResponse(error);
	}
}

export async function deleteConcurrencyKey(
	c: AppContext,
	keyId: string
): Promise<Response> {
	const stub = getConcurrencyKeys(c);
	if (stub === undefined) {
		return noWorkflows();
	}
	try {
		await stub.deleteKey(keyId);
		return c.json(wrapResponse({ status: "ok" }));
	} catch (error) {
		return toErrorResponse(error);
	}
}

export async function listConcurrencyKeyHolders(
	c: AppContext,
	keyId: string
): Promise<Response> {
	const stub = getConcurrencyKeys(c);
	if (stub === undefined) {
		return noWorkflows();
	}
	try {
		return c.json(wrapResponse(await stub.listHolders(keyId)));
	} catch (error) {
		return toErrorResponse(error);
	}
}

export async function listConcurrencyKeyWaiters(
	c: AppContext,
	keyId: string
): Promise<Response> {
	const stub = getConcurrencyKeys(c);
	if (stub === undefined) {
		return noWorkflows();
	}
	try {
		return c.json(wrapResponse(await stub.listWaiters(keyId)));
	} catch (error) {
		return toErrorResponse(error);
	}
}

export async function getInstanceConcurrencyWaits(
	c: AppContext,
	workflowName: string,
	instanceId: string
): Promise<
	Array<{
		type: "concurrency_key";
		step: string;
		key: string;
		keys: string[];
		since: string;
	}>
> {
	const stub = getConcurrencyKeys(c);
	if (stub === undefined) {
		return [];
	}
	try {
		const waits = await stub.getInstanceWaits(workflowName, instanceId);
		return waits.map((wait) => ({
			type: "concurrency_key",
			step: wait.step ?? "",
			key: wait.blocked_on,
			keys: wait.keys,
			since: wait.since,
		}));
	} catch {
		return [];
	}
}
