import { logger } from "../../shared/context";
import type { Binding } from "@cloudflare/workers-utils";

// Verifiers pin this origin in their trust policies, so it never changes.
const OIDC_ISSUER_ORIGIN = "https://oidc.cloudflare.com";

/**
 * Prints the issuer and subject that a verifier's trust policy names. The
 * subject is the Worker's immutable tag, which no other output shows.
 */
export function printOidcTokenIdentity(
	bindings: Record<string, Binding>,
	accountId: string,
	workerTag: string | null
) {
	// Checks the uploaded bindings, which a --var or secret of the same name replaces.
	const hasOidcToken = Object.values(bindings).some(
		(binding) => binding.type === "oidc_token"
	);
	if (!hasOidcToken || workerTag === null) {
		return;
	}
	logger.log("OIDC tokens for this Worker:");
	logger.log(`  Issuer:  ${OIDC_ISSUER_ORIGIN}/accounts/${accountId}`);
	logger.log(`  Subject: worker:${workerTag}`);
}
