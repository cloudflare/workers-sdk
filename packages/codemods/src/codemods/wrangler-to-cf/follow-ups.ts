import type { MigrationFollowUp, OutputComment } from "./types";

export const CONFIGURATION_DOCS_URL = `https://developers.cloudflare.com/workers/wrangler/configuration/`;
export const DURABLE_OBJECT_EXPORTS_DOCS_URL = `https://developers.cloudflare.com/workers/runtime-apis/context/#exports`;
export const ENVIRONMENTS_DOCS_URL = `https://developers.cloudflare.com/workers/wrangler/environments/`;
export const PREVIEWS_DOCS_URL = `https://developers.cloudflare.com/workers/wrangler/configuration/#previews`;
export const SECRETS_DOCS_URL = `https://developers.cloudflare.com/workers/configuration/secrets/`;

export function createFollowUp(
	code: string,
	message: string,
	options: {
		blocking?: boolean;
		docsUrl?: string;
		sourcePath?: string;
	} = {}
): MigrationFollowUp {
	return {
		blocking: options.blocking ?? true,
		code,
		docsUrl: options.docsUrl,
		message,
		sourcePath: options.sourcePath,
	};
}

export function followUpToComment(followUp: MigrationFollowUp): OutputComment {
	return {
		docsUrl: followUp.docsUrl,
		message: followUp.message,
	};
}

export function deduplicateFollowUps(
	followUps: MigrationFollowUp[]
): MigrationFollowUp[] {
	const seen = new Set<string>();
	return followUps.filter((followUp) => {
		const key = [followUp.code, followUp.sourcePath, followUp.message].join(
			"\0"
		);
		if (seen.has(key)) {
			return false;
		}

		seen.add(key);

		return true;
	});
}
