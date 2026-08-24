import { ADMIN_API as ADMIN_API_KEY } from "../../flagship/constants";
import { flagNotFoundMessage } from "../../flagship/flags";
import {
	aggregateListResults,
	fetchFromPeer,
	getPeerUrlsIfAggregating,
} from "../aggregation";
import { errorResponse, wrapResponse } from "../common";
import type { FlagshipAdmin } from "../../flagship/admin";
import type { ADMIN_API } from "../../flagship/constants";
import type { FlagChanges, Rule } from "../../flagship/flags";
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

const APPS_PATH = "/flagship/apps";

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

function appPath(appId: string, suffix = ""): string {
	return `${APPS_PATH}/${encodeURIComponent(appId)}${suffix}`;
}

function flagPath(appId: string, flagKey: string, suffix = ""): string {
	return appPath(appId, `/flags/${encodeURIComponent(flagKey)}${suffix}`);
}

async function findAppOwner(
	c: AppContext,
	appId: string
): Promise<string | null> {
	const peerUrls = await getPeerUrlsIfAggregating(c);
	if (peerUrls.length === 0) {
		return null;
	}
	const owners = await Promise.all(
		peerUrls.map(async (url) => {
			const response = await fetchFromPeer(url, APPS_PATH);
			if (!response?.ok) {
				return null;
			}
			try {
				const data = (await response.json()) as { result?: FlagshipApp[] };
				return data.result?.some((app) => app.id === appId) === true
					? url
					: null;
			} catch {
				return null;
			}
		})
	);
	return owners.find((url) => url !== null) ?? null;
}

/**
 * Runs an app-scoped operation against whichever instance owns the app.
 *
 * Apps bound in this instance are served directly. Apps discovered from a peer
 * during aggregation are proxied to their owner, so an app that appears in the
 * list is always usable.
 *
 * @param c - Hono app context
 * @param appId - The Flagship app the request targets
 * @param peerPath - Path to replay against the owning peer
 * @param handler - Runs when this instance owns the app
 * @param init - Request init to replay against the owning peer
 *
 * @returns The owner's response, or a 404 when no instance owns the app
 */
async function withApp(
	c: AppContext,
	appId: string,
	peerPath: string,
	handler: (admin: FlagshipAdmin) => Promise<Response>,
	init?: RequestInit
): Promise<Response> {
	const admin = getAdmin(c.env, appId);
	if (admin !== null) {
		return handler(admin);
	}
	const owner = await findAppOwner(c, appId);
	if (owner !== null) {
		const response = await fetchFromPeer(owner, peerPath, init);
		if (response !== null) {
			return response;
		}
	}
	return notFound(appId);
}

function jsonInit(method: string, body: unknown): RequestInit {
	return {
		method,
		body: JSON.stringify(body),
		headers: { "Content-Type": "application/json" },
	};
}

export async function listFlagshipApps(c: AppContext): Promise<Response> {
	const local: FlagshipApp[] = Object.values(
		c.env.LOCAL_EXPLORER_BINDING_MAP.flagship
	).map((info) => ({ id: info.appId, bindings: info.bindings }));

	const aggregated = await aggregateListResults(c, local, APPS_PATH);

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
	return withApp(c, appId, appPath(appId, "/flags"), async (admin) => {
		const flags = await admin.listFlags();
		return c.json({
			...wrapResponse(flags),
			result_info: { count: flags.length },
		});
	});
}

export async function getFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string
): Promise<Response> {
	return withApp(c, appId, flagPath(appId, flagKey), async (admin) => {
		try {
			return c.json(wrapResponse(await admin.getFlag(flagKey)));
		} catch (error) {
			return flagError(error, flagKey, 500);
		}
	});
}

export async function createFlagshipFlag(
	c: AppContext,
	appId: string,
	body: FlagshipCreateFlagData["body"]
): Promise<Response> {
	return withApp(
		c,
		appId,
		appPath(appId, "/flags"),
		async (admin) => {
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
				return flagError(error, body.key, 400);
			}
		},
		jsonInit("POST", body)
	);
}

/**
 * Converts rules from the request body into stored rules.
 *
 * Every field is optional on the wire, so missing values are passed through
 * unchanged for `validateFlagInput` to reject rather than being defaulted to
 * something that silently changes the author's intent.
 *
 * @param rules - Rules supplied by the client, in priority order
 *
 * @returns The rules in their stored shape
 */
function toRules(rules: FlagshipRule[]): Rule[] {
	return rules.map((rule, index) => ({
		priority: rule.priority ?? index + 1,
		conditions: (rule.conditions ?? []) as unknown as Rule["conditions"],
		serve_variation: rule.serve_variation ?? "",
		...(rule.rollout === undefined ? {} : { rollout: rule.rollout }),
	}));
}

export async function updateFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string,
	body: FlagshipUpdateFlagData["body"]
): Promise<Response> {
	return withApp(
		c,
		appId,
		flagPath(appId, flagKey),
		async (admin) => {
			const changes: FlagChanges = {
				...(body.description === undefined
					? {}
					: { description: body.description }),
				...(body.enabled === undefined ? {} : { enabled: body.enabled }),
				...(body.default_variation === undefined
					? {}
					: { default_variation: body.default_variation }),
				...(body.variations === undefined
					? {}
					: { variations: body.variations }),
				...(body.rules === undefined ? {} : { rules: toRules(body.rules) }),
			};
			try {
				return c.json(wrapResponse(await admin.patchFlag(flagKey, changes)));
			} catch (error) {
				return flagError(error, flagKey, 400);
			}
		},
		jsonInit("PATCH", body)
	);
}

export async function deleteFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string
): Promise<Response> {
	return withApp(
		c,
		appId,
		flagPath(appId, flagKey),
		async (admin) => {
			try {
				await admin.deleteFlag(flagKey);
				return c.json(wrapResponse({ success: true }));
			} catch (error) {
				return flagError(error, flagKey, 400);
			}
		},
		{ method: "DELETE" }
	);
}

export async function evaluateFlagshipFlag(
	c: AppContext,
	appId: string,
	flagKey: string,
	context: Record<string, unknown>
): Promise<Response> {
	return withApp(
		c,
		appId,
		flagPath(appId, flagKey, "/evaluate"),
		async (admin) => {
			try {
				return c.json(wrapResponse(await admin.evaluateFlag(flagKey, context)));
			} catch (error) {
				return flagError(error, flagKey, 500);
			}
		},
		jsonInit("POST", { context })
	);
}

function flagError(
	error: unknown,
	flagKey: string,
	fallbackStatus: 400 | 500
): Response {
	const message = error instanceof Error ? error.message : String(error);
	if (message === flagNotFoundMessage(flagKey)) {
		return errorResponse(
			404,
			FLAGSHIP_ERROR_NOT_FOUND,
			`Flag '${flagKey}' not found.`
		);
	}
	return errorResponse(
		fallbackStatus,
		fallbackStatus === 400 ? FLAGSHIP_ERROR_INVALID_FLAG : 10001,
		message
	);
}
