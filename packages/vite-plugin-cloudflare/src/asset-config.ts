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

/**
 * Returns true if the `changedFile` matches one of the _headers or _redirects files,
 * and the experimental support for these files is turned on.
 */
export function hasAssetsConfigChanged(
	resolvedPluginConfig: ResolvedPluginConfig,
	resolvedViteConfig: ResolvedConfig,
	changedFile: string
) {
	if (!resolvedPluginConfig.experimental?.headersAndRedirectsDevModeSupport) {
		return false;
	}
	return [
		getRedirectsConfigPath(resolvedViteConfig),
		getHeadersConfigPath(resolvedViteConfig),
	].includes(changedFile);
}

/**
 * Computes the assets config that will be passed to Miniflare,
 * taking into account whether experimental _headers and _redirects support is on.
 */
export function getAssetsConfig(
	resolvedPluginConfig: ResolvedPluginConfig,
	entryWorkerConfig: Unstable_Config | undefined,
	viteLogger: Log,
	resolvedConfig: ResolvedConfig
) {
	const assetConfig =
		resolvedPluginConfig.type === "assets-only"
			? resolvedPluginConfig.config.assets
			: entryWorkerConfig?.assets;

	const compatibilityOptions =
		resolvedPluginConfig.type === "assets-only"
			? {
					compatibility_date: resolvedPluginConfig.config.compatibility_date,
					compatibility_flags: resolvedPluginConfig.config.compatibility_flags,
				}
			: {
					...(entryWorkerConfig?.compatibility_date
						? { compatibility_date: entryWorkerConfig?.compatibility_date }
						: {}),
					...(entryWorkerConfig?.compatibility_flags
						? { compatibility_flags: entryWorkerConfig?.compatibility_flags }
						: {}),
				};

	if (!assetConfig) {
		return compatibilityOptions;
	}

	const config = {
		...compatibilityOptions,
		...assetConfig,
	};

	if (!resolvedPluginConfig.experimental?.headersAndRedirectsDevModeSupport) {
		return config;
	}

	const logger = {
		debug: viteLogger.debug.bind(viteLogger),
		log: viteLogger.info.bind(viteLogger), // viteLogger doesn't have a `log()` method
		info: viteLogger.info.bind(viteLogger),
		warn: viteLogger.warn.bind(viteLogger),
		error: viteLogger.error.bind(viteLogger),
	};

	const redirectsFile = getRedirectsConfigPath(resolvedConfig);
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

	const headersFile = getHeadersConfigPath(resolvedConfig);
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

function getRedirectsConfigPath(config: ResolvedConfig): string {
	return path.join(config.publicDir, REDIRECTS_FILENAME);
}

function getHeadersConfigPath(config: ResolvedConfig): string {
	return path.join(config.publicDir, HEADERS_FILENAME);
}
