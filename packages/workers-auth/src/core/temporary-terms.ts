import { isNonInteractiveOrCI } from "@cloudflare/workers-utils";
import type { TemporaryAccountLogger } from "../context";

/**
 * Build the temporary-preview-account terms prompt used by the OAuth flow's
 * `temporary` config.
 *
 * The flow only needs a `(question, notice) => Promise<boolean>` callback; the
 * interactive text prompt itself is consumer-specific (wrangler's lives in
 * `src/dialogs.ts`, same reason `select` is injected), so `prompt` is injected
 * while the terms-acceptance logic lives here.
 */
export function createTemporaryTermsPrompt(deps: {
	temporaryAccountLogger: TemporaryAccountLogger;
	prompt: (question: string) => Promise<string>;
}): (question: string, notice: string) => Promise<boolean> {
	const { temporaryAccountLogger, prompt } = deps;
	return async function ensureTemporaryTermsAccepted(
		question: string,
		notice: string
	): Promise<boolean> {
		if (isNonInteractiveOrCI()) {
			temporaryAccountLogger.log(notice);
			return true;
		}

		const answer = await prompt(question);
		return typeof answer === "string" && answer.trim().toLowerCase() === "yes";
	};
}
