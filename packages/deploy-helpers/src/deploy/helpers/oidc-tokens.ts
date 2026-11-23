import { logger } from "../../shared/context";
import type { CfOidcToken } from "@cloudflare/workers-utils";

// Verifiers pin this origin in their trust policies, so it never changes.
const OIDC_ISSUER_ORIGIN = "https://oidc.cloudflare.com";

/**
 * Prints the issuer and subject that a verifier's trust policy names. The
 * subject is the Worker's immutable tag, which no other output shows.
 */
export function printOidcTokenIdentity(
	oidcTokens: CfOidcToken[],
	accountId: string,
	workerTag: string | null
) {
	if (oidcTokens.length === 0 || workerTag === null) {
		return;
	}
	logger.log("OIDC tokens for this Worker:");
	logger.log(`  Issuer:  ${OIDC_ISSUER_ORIGIN}/accounts/${accountId}`);
	logger.log(`  Subject: worker:${workerTag}`);
}
