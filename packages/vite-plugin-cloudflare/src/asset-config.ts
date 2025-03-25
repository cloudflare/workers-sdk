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
import type { ResolvedPluginConfig } from "./plugin-config";
import type { Logger } from "@cloudflare/workers-shared/utils/configuration/types";
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
	// Note that we must "resolve" the changed file since the path from Vite will not match Windows backslashes.
	return [
		getRedirectsConfigPath(resolvedViteConfig),
		getHeadersConfigPath(resolvedViteConfig),
	].includes(path.resolve(changedFile));
}

/**
 * Computes the assets config that will be passed to Miniflare,
 * taking into account whether experimental _headers and _redirects support is on.
 */
export function getAssetsConfig(
	resolvedPluginConfig: ResolvedPluginConfig,
	entryWorkerConfig: Unstable_Config | undefined,
	resolvedConfig: ResolvedConfig
) {
	const assetsConfig =
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
						? { compatibility_date: entryWorkerConfig.compatibility_date }
						: {}),
					...(entryWorkerConfig?.compatibility_flags
						? { compatibility_flags: entryWorkerConfig.compatibility_flags }
						: {}),
				};

	const config = {
		...compatibilityOptions,
		...assetsConfig,
	};

	if (!resolvedPluginConfig.experimental?.headersAndRedirectsDevModeSupport) {
		return config;
	}

	const logger: Logger = {
		debug() {
			/* No debug log in Vite. */
		},
		log(message: string) {
			resolvedConfig.logger.info(message);
		},
		info(message: string) {
			resolvedConfig.logger.info(message);
		},
		warn(message: string) {
			resolvedConfig.logger.warn(message);
		},
		error(error: Error) {
			resolvedConfig.logger.error(error.message, { error });
		},
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
