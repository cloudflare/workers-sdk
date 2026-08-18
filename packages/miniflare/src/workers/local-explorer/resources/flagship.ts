import { ADMIN_API as ADMIN_API_KEY } from "../../flagship/constants";
import { aggregateListResults } from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import type { FlagshipAdmin } from "../../flagship/admin";
import type { ADMIN_API } from "../../flagship/constants";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type { FlagshipApp, FlagshipCreateFlagData } from "../generated";

const FLAGSHIP_ERROR_NOT_FOUND = 10801;
const FLAGSHIP_ERROR_INVALID_FLAG = 10802;

/**
 * Resolve the admin API for a locally simulated Flagship app.
 *
 * @param env The explorer worker's environment.
 * @param appId The Flagship app id.
 * @returns The admin API, or `null` when the app is not bound locally.
 */
function getAdmin(env: Env, appId: string): FlagshipAdmin | null {
	const info = env.LOCAL_EXPLORER_BINDING_MAP.flagship[appId];
	if (!info) {
		return null;
	}
	const binding = env[info.binding] as
		| Record<typeof ADMIN_API, () => FlagshipAdmin>
		| undefined;
	if (!binding) {
		return null;
	}
	return binding[ADMIN_API_KEY]();
}

function notFound(appId: string): Response {
	return errorResponse(
		404,
		FLAGSHIP_ERROR_NOT_FOUND,
		`Flagship app '${appId}' is not simulated locally.`
	);
}

/**
 * List the Flagship apps simulated locally across all connected instances.
 *
 * @param c The request context.
 * @returns The apps, deduplicated by id.
 */
export async function listFlagshipApps(c: AppContext): Promise<Response> {
	const local: FlagshipApp[] = Object.values(
		c.env.LOCAL_EXPLORER_BINDING_MAP.flagship
	).map((info) => ({ id: info.appId, bindings: info.bindings }));

	const aggregated = await aggregateListResults(c, local, "/flagship/apps");

	const seen = new Set<string>();
	const apps = aggregated.filter((app) => {
		if (app.id === undefined || seen.has(app.id)) {
			return false;
		}
		seen.add(app.id);
		return true;
	});

	return c.json({
		...wrapResponse(apps),
		result_info: { count: apps.length },
	});
}

/**
 * List the flags stored for a locally simulated Flagship app.
 *
 * @param c The request context.
 * @param appId The Flagship app id.
 * @returns The app's flags.
 */
export async function listFlagshipFlags(
	c: AppContext,
	appId: string
): Promise<Response> {
	const admin = getAdmin(c.env, appId);
	if (!admin) {
		return notFound(appId);
	}
	const flags = await admin.listFlags();
	return c.json({
		...wrapResponse(flags),
		result_info: { count: flags.length },
	});
}

/**
 * Get a single flag from a locally simulated Flagship app.
 *
 * @param c The request context.
 * @param appId The Flagship app id.
 * @param flagKey The flag key.
 * @returns The flag.
 */
export async function getFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string
): Promise<Response> {
	const admin = getAdmin(c.env, appId);
	if (!admin) {
		return notFound(appId);
	}
	try {
		return c.json(wrapResponse(await admin.getFlag(flagKey)));
	} catch (error) {
		return flagError(error, flagKey);
	}
}

/**
 * Create a flag in a locally simulated Flagship app.
 *
 * Rules are not accepted here, for the same reason they cannot be edited: the
 * explorer exposes the parts of a flag that are safe to change while a Worker
 * is running, and leaves targeting to the CLI.
 *
 * @param c The request context.
 * @param appId The Flagship app id.
 * @param body The flag definition.
 * @returns The created flag.
 */
export async function createFlagshipFlag(
	c: AppContext,
	appId: string,
	body: FlagshipCreateFlagData["body"]
): Promise<Response> {
	const admin = getAdmin(c.env, appId);
	if (!admin) {
		return notFound(appId);
	}
	try {
		const created = await admin.createFlag({
			key: body.key,
			description: body.description ?? undefined,
			enabled: body.enabled ?? false,
			default_variation: body.default_variation,
			variations: body.variations,
			rules: [],
		});
		return c.json(wrapResponse(created));
	} catch (error) {
		return errorResponse(
			400,
			FLAGSHIP_ERROR_INVALID_FLAG,
			error instanceof Error ? error.message : String(error)
		);
	}
}

/**
 * Update whether a flag is enabled and which variation it serves by default.
 *
 * Rules and variations are left untouched: editing those is the CLI's job, and
 * the explorer only exposes the switches that are safe to flip while a Worker
 * is running.
 *
 * @param c The request context.
 * @param appId The Flagship app id.
 * @param flagKey The flag key.
 * @param body The requested changes.
 * @returns The updated flag.
 */
export async function updateFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string,
	body: { enabled?: boolean; default_variation?: string }
): Promise<Response> {
	const admin = getAdmin(c.env, appId);
	if (!admin) {
		return notFound(appId);
	}
	try {
		const current = await admin.getFlag(flagKey);
		if (
			body.default_variation !== undefined &&
			!(body.default_variation in current.variations)
		) {
			return errorResponse(
				400,
				FLAGSHIP_ERROR_INVALID_FLAG,
				`Flag '${flagKey}' has no variation '${body.default_variation}'.`
			);
		}
		const updated = await admin.updateFlag(flagKey, {
			key: current.key,
			description: current.description,
			enabled: body.enabled ?? current.enabled,
			default_variation: body.default_variation ?? current.default_variation,
			variations: current.variations,
			rules: current.rules,
		});
		return c.json(wrapResponse(updated));
	} catch (error) {
		return flagError(error, flagKey);
	}
}

/**
 * Delete a flag from a locally simulated Flagship app.
 *
 * @param c The request context.
 * @param appId The Flagship app id.
 * @param flagKey The flag key.
 * @returns A success envelope.
 */
export async function deleteFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string
): Promise<Response> {
	const admin = getAdmin(c.env, appId);
	if (!admin) {
		return notFound(appId);
	}
	try {
		await admin.deleteFlag(flagKey);
		return c.json(wrapResponse({ success: true }));
	} catch (error) {
		return flagError(error, flagKey);
	}
}

/**
 * Evaluate a flag against a context, exactly as a Worker binding would.
 *
 * @param c The request context.
 * @param appId The Flagship app id.
 * @param flagKey The flag key.
 * @param context Attributes used for rule matching and rollout bucketing.
 * @returns The evaluation details.
 */
export async function evaluateFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string,
	context: Record<string, unknown>
): Promise<Response> {
	const admin = getAdmin(c.env, appId);
	if (!admin) {
		return notFound(appId);
	}
	try {
		return c.json(wrapResponse(await admin.evaluateFlag(flagKey, context)));
	} catch (error) {
		return flagError(error, flagKey);
	}
}

/**
 * Map an admin API failure to an API error response.
 *
 * @param error The thrown error.
 * @param flagKey The flag the request targeted.
 * @returns A 404 for a missing flag, otherwise a 500.
 */
function flagError(error: unknown, flagKey: string): Response {
	const message = error instanceof Error ? error.message : String(error);
	if (message.includes("not found")) {
		return errorResponse(
			404,
			FLAGSHIP_ERROR_NOT_FOUND,
			`Flag '${flagKey}' not found.`
		);
	}
	return errorResponse(500, 10001, message);
}
