import { ADMIN_API as ADMIN_API_KEY } from "../../flagship/constants";
import { flagConflictMessage, flagNotFoundMessage } from "../../flagship/flags";
import { aggregateListResults } from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import type { FlagshipAdmin } from "../../flagship/admin";
import type { FlagInput } from "../../flagship/flags";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type {
	FlagshipApp,
	FlagshipCreateFlagData,
	FlagshipEvaluateFlagPostData,
	FlagshipListFlagsData,
	FlagshipPatchFlagData,
	FlagshipUpdateFlagData,
} from "../generated";

const FLAGSHIP_ERROR_NOT_FOUND = 10801;
const FLAGSHIP_ERROR_INVALID_FLAG = 10802;
const FLAGSHIP_ERROR_CONFLICT = 10803;

const DEFAULT_FLAGS_PAGE_SIZE = 100;

type EvaluationErrorCode = "FLAG_NOT_FOUND" | "GENERAL";

function getAdmin(env: Env, appId: string): FlagshipAdmin {
	return env.MINIFLARE_FLAGSHIP[ADMIN_API_KEY](appId);
}

/** Lists the Flagship apps bound by local Workers. */
export async function listFlagshipApps(c: AppContext): Promise<Response> {
	const local: FlagshipApp[] = Object.values(
		c.env.LOCAL_EXPLORER_BINDING_MAP.flagship
	).map((info) => ({ id: info.appId, bindings: info.bindings }));

	const aggregated = await aggregateListResults(c, local, "/flagship/apps", {
		sharedStorageOnly: true,
	});

	const appsById = new Map<string, FlagshipApp>();
	for (const app of aggregated) {
		const bindings = appsById.get(app.id)?.bindings ?? [];
		appsById.set(app.id, {
			id: app.id,
			bindings: [...new Set([...bindings, ...app.bindings])],
		});
	}
	const apps = [...appsById.values()];

	return c.json({
		...wrapResponse(apps),
		result_info: { count: apps.length },
	});
}

/** Lists flags ordered by key, paginated by the last key returned. */
export async function listFlagshipFlags(
	c: AppContext,
	appId: string,
	{
		cursor,
		limit = DEFAULT_FLAGS_PAGE_SIZE,
	}: NonNullable<FlagshipListFlagsData["query"]>
): Promise<Response> {
	const flags = (await getAdmin(c.env, appId).listFlags()).filter(
		(flag) => !cursor || flag.key > cursor
	);
	const page = flags.slice(0, limit);
	return c.json({
		...wrapResponse(page),
		result_info: {
			count: page.length,
			cursor: flags.length > limit ? page[page.length - 1].key : null,
		},
	});
}

/** Creates a flag; fails if the key already exists. */
export async function createFlagshipFlag(
	c: AppContext,
	appId: string,
	body: FlagshipCreateFlagData["body"]
): Promise<Response> {
	return flagResult(
		c,
		body.key,
		400,
		() => getAdmin(c.env, appId).createFlag(toFlagInput(body.key, body)),
		201
	);
}

/** Gets a single flag. */
export async function getFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string
): Promise<Response> {
	return flagResult(c, flagKey, 500, () =>
		getAdmin(c.env, appId).getFlag(flagKey)
	);
}

/** Replaces a flag; omitted optional fields are cleared. */
export async function updateFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string,
	body: FlagshipUpdateFlagData["body"]
): Promise<Response> {
	// The path key identifies the flag, as in production.
	return flagResult(c, flagKey, 400, () =>
		getAdmin(c.env, appId).updateFlag(flagKey, toFlagInput(flagKey, body))
	);
}

/** Applies a partial update; omitted fields keep their current values. */
export async function patchFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string,
	body: FlagshipPatchFlagData["body"]
): Promise<Response> {
	return flagResult(c, flagKey, 400, () =>
		getAdmin(c.env, appId).patchFlag(flagKey, body)
	);
}

/** Deletes a flag. */
export async function deleteFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string
): Promise<Response> {
	return flagResult(c, flagKey, 500, async () => {
		await getAdmin(c.env, appId).deleteFlag(flagKey);
		return { key: flagKey };
	});
}

/** Coerces a query-string context value as Flagship's evaluate API does. */
function coerceQueryParam(value: string): string | number | boolean {
	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}
	const number = Number(value);
	return Number.isFinite(number) &&
		String(number) === value &&
		(!Number.isInteger(number) || Number.isSafeInteger(number))
		? number
		: value;
}

/** Evaluates the flag named in the body. */
export async function evaluateFlagshipApp(
	c: AppContext,
	appId: string,
	body: FlagshipEvaluateFlagPostData["body"]
): Promise<Response> {
	return evaluationResult(c, appId, body.flagKey, body.context ?? {});
}

/** Evaluates a flag using the query string as the context. */
export async function evaluateFlagshipAppQuery(
	c: AppContext,
	appId: string
): Promise<Response> {
	const query = c.req.query();
	const flagKey = query.flagKey;
	if (!flagKey) {
		return evaluationError(400, "Missing flagKey query parameter", "GENERAL");
	}
	const context = Object.fromEntries(
		Object.entries(query)
			.filter(([name]) => name !== "flagKey")
			.map(([name, value]) => [name, coerceQueryParam(value)])
	);
	return evaluationResult(c, appId, flagKey, context);
}

/** Evaluates a flag, returning the bare result as Flagship's evaluate API does. */
async function evaluationResult(
	c: AppContext,
	appId: string,
	flagKey: string,
	context: Record<string, unknown>
): Promise<Response> {
	try {
		return c.json(await getAdmin(c.env, appId).evaluateFlag(flagKey, context));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return message === flagNotFoundMessage(flagKey)
			? evaluationError(404, `Flag '${flagKey}' not found.`, "FLAG_NOT_FOUND")
			: evaluationError(500, message, "GENERAL");
	}
}

function evaluationError(
	status: number,
	message: string,
	errorCode: EvaluationErrorCode
): Response {
	return Response.json(
		{
			success: false,
			errors: [{ code: 10001, message }],
			messages: [],
			result: null,
			errorCode,
		},
		{ status }
	);
}

/** Converts a create or replace request body into a store flag. */
function toFlagInput(
	key: string,
	body: FlagshipCreateFlagData["body"]
): FlagInput {
	// `type` is omitted: the store infers it from the variations, as in production.
	return {
		key,
		description: body.description,
		enabled: body.enabled,
		default_variation: body.default_variation,
		variations: body.variations,
		rules: body.rules,
		metadata: body.metadata,
	};
}

/** Runs a flag operation, mapping store errors to API error responses. */
async function flagResult(
	c: AppContext,
	flagKey: string,
	fallbackStatus: 400 | 500,
	operation: () => Promise<unknown>,
	status: 200 | 201 = 200
): Promise<Response> {
	try {
		return c.json(wrapResponse(await operation()), status);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (message === flagNotFoundMessage(flagKey)) {
			return errorResponse(
				404,
				FLAGSHIP_ERROR_NOT_FOUND,
				`Flag '${flagKey}' not found.`
			);
		}
		if (message === flagConflictMessage(flagKey)) {
			return errorResponse(409, FLAGSHIP_ERROR_CONFLICT, message);
		}
		return errorResponse(
			fallbackStatus,
			fallbackStatus === 400 ? FLAGSHIP_ERROR_INVALID_FLAG : 10001,
			message
		);
	}
}
