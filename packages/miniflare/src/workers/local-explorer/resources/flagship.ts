import { ADMIN_API as ADMIN_API_KEY } from "../../flagship/constants";
import { aggregateListResults } from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import type { FlagshipAdmin } from "../../flagship/admin";
import type { ADMIN_API } from "../../flagship/constants";
import type { Flag } from "../../flagship/flags";
import type { Rule } from "../../flagship/flags";
import type { AppContext } from "../common";
import type { Env } from "../explorer.worker";
import type {
	FlagshipApp,
	FlagshipCreateFlagData,
	FlagshipRule,
	FlagshipUpdateFlagData,
} from "../generated";

const FLAGSHIP_ERROR_NOT_FOUND = 10801;
const FLAGSHIP_ERROR_INVALID_FLAG = 10802;

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

function matchesIfNoneMatch(header: string | undefined, etag: string): boolean {
	if (header === undefined) {
		return false;
	}
	const value = header.trim();
	if (value === "*") {
		return true;
	}
	const candidates = value.match(/(?:W\/)?"[^"]*"/g) ?? [];
	return candidates.some((candidate) => candidate.replace(/^W\//, "") === etag);
}

function toDefinition(flag: Flag) {
	return {
		key: flag.key,
		enabled: flag.enabled,
		default_variation: flag.default_variation,
		variations: flag.variations,
		rules: flag.rules,
	};
}

async function contentEtag(payload: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(payload)
	);
	const hash = Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0")
	).join("");
	return `"${hash}"`;
}

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

export async function getFlagshipDefinitions(
	c: AppContext,
	appId: string
): Promise<Response> {
	const admin = getAdmin(c.env, appId);
	if (!admin) {
		return notFound(appId);
	}
	const flags = (await admin.listFlags()).sort((a, b) =>
		a.key.localeCompare(b.key)
	);
	const payload = JSON.stringify({
		flags: Object.fromEntries(
			flags.map((flag) => [flag.key, toDefinition(flag)])
		),
	});
	const etag = await contentEtag(payload);
	if (matchesIfNoneMatch(c.req.header("If-None-Match"), etag)) {
		return new Response(null, { status: 304, headers: { ETag: etag } });
	}
	return new Response(payload, {
		headers: { "Content-Type": "application/json", ETag: etag },
	});
}

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
			rules: toRules(body.rules ?? []),
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
 * Converts rules from the request body into stored rules.
 *
 * Every field is optional on the wire, so missing values are filled in with
 * ones that `validateFlagInput` will reject rather than silently accept.
 *
 * @param rules - Rules supplied by the client, in priority order
 *
 * @returns The rules in their stored shape
 */
function toRules(rules: FlagshipRule[]): Rule[] {
	return rules.map((rule, index) => ({
		priority: rule.priority ?? index + 1,
		// Narrowed from the schema's free-form objects; validation rejects bad shapes.
		conditions: (rule.conditions ?? []) as unknown as Rule["conditions"],
		serve_variation: rule.serve_variation ?? "",
		...(rule.rollout === undefined
			? {}
			: {
					rollout: {
						percentage: rule.rollout.percentage ?? 100,
						...(rule.rollout.attribute === undefined
							? {}
							: { attribute: rule.rollout.attribute }),
					},
				}),
	}));
}

export async function updateFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string,
	body: FlagshipUpdateFlagData["body"]
): Promise<Response> {
	const admin = getAdmin(c.env, appId);
	if (!admin) {
		return notFound(appId);
	}

	let current: Flag;
	try {
		current = await admin.getFlag(flagKey);
	} catch (error) {
		return flagError(error, flagKey);
	}

	const variations = body.variations ?? current.variations;
	const defaultVariation = body.default_variation ?? current.default_variation;
	if (!Object.hasOwn(variations, defaultVariation)) {
		return errorResponse(
			400,
			FLAGSHIP_ERROR_INVALID_FLAG,
			`Flag '${flagKey}' has no variation '${defaultVariation}'.`
		);
	}

	try {
		const updated = await admin.updateFlag(flagKey, {
			key: current.key,
			description:
				body.description !== undefined ? body.description : current.description,
			enabled: body.enabled ?? current.enabled,
			default_variation: defaultVariation,
			variations,
			rules: body.rules === undefined ? current.rules : toRules(body.rules),
		});
		return c.json(wrapResponse(updated));
	} catch (error) {
		return errorResponse(
			400,
			FLAGSHIP_ERROR_INVALID_FLAG,
			error instanceof Error ? error.message : String(error)
		);
	}
}

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
