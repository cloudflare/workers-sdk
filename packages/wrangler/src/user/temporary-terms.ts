import { UserError } from "@cloudflare/workers-utils";
import { promptForExplicitYes } from "../dialogs";
import { isNonInteractiveOrCI } from "../is-interactive";

export const TEMPORARY_TERMS_PROMPT =
	'Before continuing with --temporary, you must accept Cloudflare\'s Terms of Service (https://www.cloudflare.com/website-terms/) and Privacy Policy (https://www.cloudflare.com/privacypolicy/). Anything you deploy with --temporary is temporary and may expire unless you claim it before it expires. By typing "yes", you agree to these terms. Type "yes" to continue.';
export const TEMPORARY_TERMS_ACCEPTANCE_ENV = "WRANGLER_TEMPORARY_ACCEPT_TERMS";

const TEMPORARY_TERMS_ERROR =
	"You must accept Cloudflare's Terms of Service and Privacy Policy to use --temporary.";

export async function ensureTemporaryTermsAccepted(): Promise<void> {
	if (
		process.env[TEMPORARY_TERMS_ACCEPTANCE_ENV]?.trim().toLowerCase() === "yes"
	) {
		return;
	}

	if (isNonInteractiveOrCI()) {
		throw new UserError(
			`${TEMPORARY_TERMS_ERROR} To accept non-interactively, set ${TEMPORARY_TERMS_ACCEPTANCE_ENV}=yes.`,
			{ telemetryMessage: "user temporary terms not accepted" }
		);
	}

	if (await promptForExplicitYes(TEMPORARY_TERMS_PROMPT)) {
		return;
	}

	throw new UserError(TEMPORARY_TERMS_ERROR, {
		telemetryMessage: "user temporary terms not accepted",
	});
}
