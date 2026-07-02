import { throwFetchError } from "@cloudflare/workers-utils";
import { fetchResult, performApiFetch } from "../cfetch";
import { requireAuth } from "../user";
import type { Config, FetchResult } from "@cloudflare/workers-utils";

export type FlagType = "boolean" | "string" | "number" | "json";

export type Operator =
	| "equals"
	| "not_equals"
	| "greater_than"
	| "less_than"
	| "greater_than_or_equals"
	| "less_than_or_equals"
	| "contains"
	| "starts_with"
	| "ends_with"
	| "in"
	| "not_in";

export type LogicalOperator = "AND" | "OR";

export type BaseCondition = {
	attribute: string;
	operator: Operator;
	value: unknown;
};

export type LogicalCondition = {
	logical_operator: LogicalOperator;
	clauses: Condition[];
};

export type Condition = BaseCondition | LogicalCondition;

export type Rollout = {
	percentage: number;
	attribute?: string;
};

export type Rule = {
	priority: number;
	conditions: Condition[];
	serve_variation: string;
	rollout?: Rollout;
};

export type Flag = {
	key: string;
	type?: FlagType;
	description?: string | null;
	enabled: boolean;
	default_variation: string;
	variations: Record<string, unknown>;
	rules: Rule[];
	updated_at?: string;
	updated_by?: string;
};

export type FlagInput = {
	key: string;
	description?: string | null;
	enabled: boolean;
	default_variation: string;
	variations: Record<string, unknown>;
	rules: Rule[];
};

export function toFlagInput(flag: Flag): FlagInput {
	return {
		key: flag.key,
		description: flag.description,
		enabled: flag.enabled,
		default_variation: flag.default_variation,
		variations: flag.variations,
		rules: flag.rules,
	};
}

export type App = {
	id: string;
	name: string;
	created_at: string;
	updated_at: string;
	updated_by: string;
};

export type ChangelogEntry = {
	flag_key: string;
	event: "create" | "update" | "delete";
	after: Flag;
	diff?: Record<string, { from: unknown; to: unknown }>;
};

export type EvaluationReason =
	| "TARGETING_MATCH"
	| "DEFAULT"
	| "DISABLED"
	| "SPLIT";

export type EvaluationResult = {
	flagKey: string;
	value?: unknown;
	variant?: string;
	reason?: EvaluationReason;
};

export type Page<T> = {
	items: T[];
	cursor: string | null;
};

const JSON_HEADERS = { "content-type": "application/json" };

function pathSegment(value: string): string {
	return encodeURIComponent(value);
}

async function fetchPage<T>(
	config: Config,
	resource: string,
	limit?: number,
	cursor?: string
): Promise<Page<T>> {
	const query = new URLSearchParams();
	if (limit !== undefined) {
		query.set("limit", String(limit));
	}
	if (cursor) {
		query.set("cursor", cursor);
	}
	const response = await performApiFetch(
		config,
		resource,
		{ method: "GET" },
		query
	);
	const body = (await response.json()) as FetchResult<T[]>;
	if (!body.success) {
		throwFetchError(resource, body, response.status);
	}
	const resultInfo = body.result_info as { cursor?: string | null } | undefined;
	return { items: body.result ?? [], cursor: resultInfo?.cursor ?? null };
}

export async function createApp(config: Config, name: string): Promise<App> {
	const accountId = await requireAuth(config);
	return await fetchResult(config, `/accounts/${accountId}/flagship/apps`, {
		method: "POST",
		headers: JSON_HEADERS,
		body: JSON.stringify({ name }),
	});
}

export async function listApps(config: Config): Promise<App[]> {
	const accountId = await requireAuth(config);
	const items: App[] = [];
	let cursor: string | undefined;
	do {
		const page = await fetchPage<App>(
			config,
			`/accounts/${accountId}/flagship/apps`,
			undefined,
			cursor
		);
		items.push(...page.items);
		cursor = page.cursor ?? undefined;
	} while (cursor);
	return items;
}

export async function getApp(config: Config, appId: string): Promise<App> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/flagship/apps/${pathSegment(appId)}`,
		{ method: "GET" }
	);
}

export async function updateApp(
	config: Config,
	appId: string,
	name: string
): Promise<App> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/flagship/apps/${pathSegment(appId)}`,
		{ method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ name }) }
	);
}

export async function deleteApp(
	config: Config,
	appId: string
): Promise<{ id: string }> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/flagship/apps/${pathSegment(appId)}`,
		{ method: "DELETE" }
	);
}

export async function listFlags(
	config: Config,
	appId: string,
	limit?: number,
	cursor?: string
): Promise<Page<Flag>> {
	const accountId = await requireAuth(config);
	return await fetchPage<Flag>(
		config,
		`/accounts/${accountId}/flagship/apps/${pathSegment(appId)}/flags`,
		limit,
		cursor
	);
}

export async function listAllFlags(
	config: Config,
	appId: string
): Promise<Flag[]> {
	const items: Flag[] = [];
	let cursor: string | undefined;
	do {
		const page = await listFlags(config, appId, undefined, cursor);
		items.push(...page.items);
		cursor = page.cursor ?? undefined;
	} while (cursor);
	return items;
}

export async function createFlag(
	config: Config,
	appId: string,
	flag: FlagInput
): Promise<Flag> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/flagship/apps/${pathSegment(appId)}/flags`,
		{ method: "POST", headers: JSON_HEADERS, body: JSON.stringify(flag) }
	);
}

export async function getFlag(
	config: Config,
	appId: string,
	flagKey: string
): Promise<Flag> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/flagship/apps/${pathSegment(appId)}/flags/${pathSegment(flagKey)}`,
		{ method: "GET" }
	);
}

export async function updateFlag(
	config: Config,
	appId: string,
	flagKey: string,
	flag: FlagInput
): Promise<Flag> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/flagship/apps/${pathSegment(appId)}/flags/${pathSegment(flagKey)}`,
		{ method: "PUT", headers: JSON_HEADERS, body: JSON.stringify(flag) }
	);
}

export async function deleteFlag(
	config: Config,
	appId: string,
	flagKey: string
): Promise<{ key: string }> {
	const accountId = await requireAuth(config);
	return await fetchResult(
		config,
		`/accounts/${accountId}/flagship/apps/${pathSegment(appId)}/flags/${pathSegment(flagKey)}`,
		{ method: "DELETE" }
	);
}

export async function getFlagChangelog(
	config: Config,
	appId: string,
	flagKey: string,
	limit?: number,
	cursor?: string
): Promise<Page<ChangelogEntry>> {
	const accountId = await requireAuth(config);
	return await fetchPage<ChangelogEntry>(
		config,
		`/accounts/${accountId}/flagship/apps/${pathSegment(appId)}/flags/${pathSegment(flagKey)}/changelog`,
		limit,
		cursor
	);
}

export async function getAllFlagChangelog(
	config: Config,
	appId: string,
	flagKey: string
): Promise<ChangelogEntry[]> {
	const items: ChangelogEntry[] = [];
	let cursor: string | undefined;
	do {
		const page = await getFlagChangelog(
			config,
			appId,
			flagKey,
			undefined,
			cursor
		);
		items.push(...page.items);
		cursor = page.cursor ?? undefined;
	} while (cursor);
	return items;
}

export async function evaluateFlag(
	config: Config,
	appId: string,
	flagKey: string,
	context: Record<string, string>
): Promise<EvaluationResult> {
	const accountId = await requireAuth(config);
	const resource = `/accounts/${accountId}/flagship/apps/${pathSegment(appId)}/evaluate`;
	const query = new URLSearchParams({ ...context, flagKey });
	const response = await performApiFetch(
		config,
		resource,
		{ method: "GET" },
		query
	);
	const body = (await response.json()) as
		| EvaluationResult
		| FetchResult<EvaluationResult>;
	if ("success" in body) {
		if (!body.success) {
			throwFetchError(resource, body, response.status);
		}
		return body.result;
	}
	return body as EvaluationResult;
}
