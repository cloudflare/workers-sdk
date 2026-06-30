import { fetchResultBase } from "@cloudflare/workers-utils";
import type { Logger } from "../logger";
import type { AuthCredentials } from "../types";
import type { ComplianceConfig } from "@cloudflare/workers-utils";
import type { RequestInit } from "undici";

/** Identifies remote-bindings requests to the Cloudflare API. */
const USER_AGENT = "@cloudflare/remote-bindings";

function toComplianceConfig(region: string | undefined): ComplianceConfig {
	return { compliance_region: region as ComplianceConfig["compliance_region"] };
}

/**
 * Make an authenticated Cloudflare API request and return its `result`.
 *
 * Thin wrapper over workers-utils' shared API client (`fetchResultBase`), so we
 * don't duplicate authorization headers, base-URL / compliance-region handling,
 * or error parsing.
 */
export async function fetchResult<T>(
	auth: AuthCredentials,
	resource: string,
	init: RequestInit | undefined,
	complianceRegion: string | undefined,
	logger: Logger,
	abortSignal?: AbortSignal
): Promise<T> {
	return fetchResultBase<T>(
		toComplianceConfig(complianceRegion),
		resource,
		init ?? {},
		USER_AGENT,
		logger,
		undefined,
		abortSignal,
		auth.apiToken
	);
}
