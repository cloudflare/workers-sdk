import { UserError } from "@cloudflare/workers-utils";
import { promptForExplicitYes } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";
import { logger } from "../logger";
import { TEMPORARY_TERMS_URLS } from "./temporary-terms-policy";

export const TEMPORARY_TERMS_PROMPT = `You must accept Cloudflare's Terms of Service (${TEMPORARY_TERMS_URLS.termsOfService}) and Privacy Policy (${TEMPORARY_TERMS_URLS.privacyPolicy}) in order to continue. By typing "yes", you agree to these terms. Type "yes" to continue.`;
export const TEMPORARY_TERMS_NOTICE = `Continuing means you accept Cloudflare's Terms of Service (${TEMPORARY_TERMS_URLS.termsOfService}) and Privacy Policy (${TEMPORARY_TERMS_URLS.privacyPolicy}).`;

const TEMPORARY_TERMS_ERROR = `You must accept Cloudflare's Terms of Service (${TEMPORARY_TERMS_URLS.termsOfService}) and Privacy Policy (${TEMPORARY_TERMS_URLS.privacyPolicy}) to use --temporary.`;

export async function ensureTemporaryTermsAccepted(): Promise<void> {
	if (isNonInteractiveOrCI()) {
		logger.log(TEMPORARY_TERMS_NOTICE);
		return;
	}

	if (await promptForExplicitYes(TEMPORARY_TERMS_PROMPT)) {
		return;
	}

	throw new UserError(TEMPORARY_TERMS_ERROR, {
		telemetryMessage: "user temporary terms not accepted",
	});
}
