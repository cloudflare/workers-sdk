import semiver from "semiver";
import { version as wranglerVersion } from "../../package.json";
import { logger } from "../logger";

export const MIN_WRANGLER_PREVIEW_VERSION = "4.127.1";

export function isWranglerPreviewVersionUnsupported(
	version = wranglerVersion
): boolean {
	return semiver(version, MIN_WRANGLER_PREVIEW_VERSION) < 0;
}

export function formatWranglerPreviewVersionWarning(
	version = wranglerVersion
): string {
	return `Workers Previews require Wrangler ${MIN_WRANGLER_PREVIEW_VERSION} or later. This project is using Wrangler ${version}.

\`npx wrangler preview\` uses the Wrangler installed in this project, not your global Wrangler.

Update this project:
  npm install -D wrangler@latest @cloudflare/workers-types@latest

Or run once:
  npx wrangler@latest preview`;
}

export function warnIfWranglerPreviewVersionUnsupported(
	version = wranglerVersion
): boolean {
	if (!isWranglerPreviewVersionUnsupported(version)) {
		return false;
	}

	logger.warn(formatWranglerPreviewVersionWarning(version));
	return true;
}
