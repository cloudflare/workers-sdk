// Thin wrapper around `@cloudflare/workers-auth`'s Access helpers that
// injects wrangler's `logger` singleton and `isNonInteractiveOrCI` predicate so
// the historical call sites can keep using a single-argument signature.
import {
	clearAccessCaches as packageClearAccessCaches,
	domainUsesAccess as packageDomainUsesAccess,
	getAccessHeaders as packageGetAccessHeaders,
} from "@cloudflare/workers-auth";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";

export function clearAccessCaches(): void {
	packageClearAccessCaches();
}

export async function domainUsesAccess(domain: string): Promise<boolean> {
	return packageDomainUsesAccess(domain, logger);
}

export async function getAccessHeaders(
	domain: string
): Promise<Record<string, string>> {
	return packageGetAccessHeaders(domain, {
		logger,
		isNonInteractiveOrCI,
	});
}
