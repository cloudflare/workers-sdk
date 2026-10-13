import {
	getCloudflareApiBaseUrl,
	partitionExports,
} from "@cloudflare/workers-utils";
import { fetch } from "undici";
import { version as wranglerVersion } from "../../package.json";
import { logger } from "../logger";
import { getAuthFromEnv, getOAuthTokenFromLocalState } from "../user";
import type { ComplianceConfig, Config } from "@cloudflare/workers-utils";

const SECTION_START = "// Begin concurrency keys";
const SECTION_END = "// End concurrency keys";
const FETCH_TIMEOUT_MS = 5_000;
const PER_PAGE = 100;
const MAX_PAGES = 100; // 10,000 keys; bounds a misbehaving pager

/** `fetch` lists the account's keys; `keep` reuses the section already in the types file, so
 * regenerations that must stay offline (`wrangler dev`, the programmatic API) never drop it. */
export type ConcurrencyKeysMode = "fetch" | "keep" | "off";

/** Keys are typed only for a Worker that defines a Workflow and pins its account, so the
 * result depends on the config file rather than on the shell's environment or a cached account. */
export function shouldTypeConcurrencyKeys(
	config: Pick<Config, "account_id" | "name" | "workflows" | "exports">
): config is typeof config & { account_id: string } {
	if (config.account_id === undefined) {
		return false;
	}
	const definesWorkflowBinding = config.workflows.some(
		(workflow) =>
			workflow.script_name === undefined || workflow.script_name === config.name
	);
	return (
		definesWorkflowBinding ||
		Object.keys(partitionExports(config.exports).workflow).length > 0
	);
}

/** The delimited section from a previously generated types file, if it targets `accountId`.
 * A section from another account would type the wrong keys, so it is dropped instead. */
export function extractConcurrencyKeysSection(
	content: string | undefined,
	accountId: string
): string | undefined {
	const lines = content?.split("\n") ?? [];
	const start = lines.indexOf(sectionStart(accountId));
	const end = lines.indexOf(SECTION_END, start);
	if (start === -1 || end === -1) {
		return undefined;
	}
	return lines.slice(start, end + 1).join("\n");
}

/** The concurrency keys section for a generated types file, or `undefined` for none.
 * Failures keep the previous section: a stale key list beats losing typed keys offline. */
export async function resolveConcurrencyKeysSection(
	config: Config,
	mode: ConcurrencyKeysMode,
	existingContent: string | undefined
): Promise<string | undefined> {
	if (mode === "off" || !shouldTypeConcurrencyKeys(config)) {
		return undefined;
	}
	const accountId = config.account_id;
	const previous = extractConcurrencyKeysSection(existingContent, accountId);
	if (mode === "keep") {
		return previous;
	}

	let names: string[];
	try {
		const headers = await getAuthHeaders();
		if (headers === undefined) {
			logger.warn(
				"Not authenticated - concurrency key names stay untyped. Run `wrangler login` to type them."
			);
			return previous;
		}
		names = await fetchConcurrencyKeyNames(config, accountId, headers);
	} catch (error) {
		logger.debug("Failed to list concurrency keys", error);
		logger.warn(
			"Could not list concurrency keys - keeping the previously generated key names."
		);
		return previous;
	}
	if (names.length === 0) {
		return undefined;
	}
	return [
		sectionStart(accountId),
		renderConcurrencyKeyDeclaration(names),
		SECTION_END,
	].join("\n");
}

/** The `Cloudflare.GlobalProps` augmentation that narrows `WorkflowStepConfig.concurrency`.
 * Names are sorted and JSON-escaped so the output is stable and valid for any key name. */
export function renderConcurrencyKeyDeclaration(
	names: readonly string[]
): string {
	const literals = [...new Set(names)]
		.sort()
		.map((name) => JSON.stringify(name));
	const union =
		literals.length === 1
			? ` ${literals[0]};`
			: `\n${literals.map((literal) => `\t\t\t| ${literal}`).join("\n")};`;
	return [
		"declare namespace Cloudflare {",
		"\tinterface GlobalProps {",
		`\t\tconcurrencyKeys:${union}`,
		"\t}",
		"}",
	].join("\n");
}

/** Lists every key name in the account, or throws. Wrangler's API helpers log in when needed,
 * which `wrangler types` must never do, and a partial listing would turn real keys into errors. */
export async function fetchConcurrencyKeyNames(
	complianceConfig: ComplianceConfig,
	accountId: string,
	headers: Record<string, string>
): Promise<string[]> {
	const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
	const baseUrl = getCloudflareApiBaseUrl(complianceConfig).replace(/\/$/, "");
	const names: string[] = [];
	let totalCount = 0;
	for (let page = 1; page <= MAX_PAGES; page++) {
		const url = new URL(
			`${baseUrl}/accounts/${encodeURIComponent(accountId)}/workflows/concurrency`
		);
		url.searchParams.set("page", String(page));
		url.searchParams.set("per_page", String(PER_PAGE));
		const response = await fetch(url, {
			headers: { ...headers, "User-Agent": `wrangler/${wranglerVersion}` },
			signal,
		});
		const body = (await response.json().catch(() => undefined)) as
			| ListConcurrencyKeysResponse
			| undefined;
		if (!response.ok || body?.success !== true || !Array.isArray(body.result)) {
			throw new Error(
				`Listing concurrency keys failed with status ${response.status}`
			);
		}
		names.push(...body.result.map((key) => key.name));
		totalCount = body.result_info?.total_count ?? names.length;
		if (page >= (body.result_info?.total_pages ?? page)) {
			break;
		}
	}
	if (names.length !== totalCount) {
		throw new Error(
			`Listing concurrency keys returned ${names.length} of ${totalCount} keys`
		);
	}
	return names;
}

interface ListConcurrencyKeysResponse {
	success: boolean;
	result: { name: string }[];
	result_info?: { total_count?: number; total_pages?: number };
}

function sectionStart(accountId: string): string {
	return `${SECTION_START} (account ${accountId})`;
}

async function getAuthHeaders(): Promise<Record<string, string> | undefined> {
	const envCredentials = getAuthFromEnv();
	if (envCredentials !== undefined) {
		return "apiToken" in envCredentials
			? { Authorization: `Bearer ${envCredentials.apiToken}` }
			: {
					"X-Auth-Key": envCredentials.authKey,
					"X-Auth-Email": envCredentials.authEmail,
				};
	}
	const token = await getOAuthTokenFromLocalState();
	return token === undefined ? undefined : { Authorization: `Bearer ${token}` };
}
