import * as path from "node:path";
import {
	constructHeaders,
	constructRedirects,
} from "@cloudflare/workers-shared/utils/configuration/constructConfiguration";
import { parseHeaders } from "@cloudflare/workers-shared/utils/configuration/parseHeaders";
import { parseRedirects } from "@cloudflare/workers-shared/utils/configuration/parseRedirects";
import {
	HEADERS_FILENAME,
	REDIRECTS_FILENAME,
} from "@cloudflare/workers-shared/utils/constants";
import { maybeGetFile } from "@cloudflare/workers-shared/utils/helpers";
import {
	HeadersSchema,
	RedirectsSchema,
} from "@cloudflare/workers-shared/utils/types";
import { Log } from "miniflare";
import type { ResolvedPluginConfig } from "./plugin-config";
import type { ResolvedConfig } from "vite";
import type { Unstable_Config } from "wrangler";

export function getRedirectsPath(config: ResolvedConfig): string {
	return path.join(config.publicDir, REDIRECTS_FILENAME);
}

export function getHeadersPath(config: ResolvedConfig): string {
	return path.join(config.publicDir, HEADERS_FILENAME);
}

export function getAssetsConfig(
	resolvedPluginConfig: ResolvedPluginConfig,
	workerAssetsConfig: Unstable_Config["assets"],
	viteLogger: Log,
	resolvedConfig: ResolvedConfig
) {
	const config =
		resolvedPluginConfig.type === "assets-only"
			? resolvedPluginConfig.config.assets
			: workerAssetsConfig;

	if (!config) {
		return {};
	}

	const logger = {
		debug: viteLogger.debug.bind(viteLogger),
		log: viteLogger.info.bind(viteLogger), // viteLogger doesn't have a `log()` method
		info: viteLogger.info.bind(viteLogger),
		warn: viteLogger.warn.bind(viteLogger),
		error: viteLogger.error.bind(viteLogger),
	};

	const redirectsFile = getRedirectsPath(resolvedConfig);
	const redirectsContents = maybeGetFile(redirectsFile);
	const redirects =
		redirectsContents &&
		RedirectsSchema.parse(
			constructRedirects({
				redirects: parseRedirects(redirectsContents),
				redirectsFile,
				logger,
			}).redirects
		);

	const headersFile = getHeadersPath(resolvedConfig);
	const headersContents = maybeGetFile(headersFile);
	const headers =
		headersContents &&
		HeadersSchema.parse(
			constructHeaders({
				headers: parseHeaders(headersContents),
				headersFile,
				logger,
			}).headers
		);

	return {
		...config,
		...(redirects ? { redirects } : {}),
		...(headers ? { headers } : {}),
	};
}
