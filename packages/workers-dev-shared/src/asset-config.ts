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
import type { DevLogger } from "./logger";
import type {
	AssetsOnlyResolvedConfig,
	ResolvedWorkerConfig,
	WorkersResolvedConfig,
} from "./plugin-config";
import type { Logger } from "@cloudflare/workers-shared/utils/configuration/types";
import type { AssetConfig } from "@cloudflare/workers-shared/utils/types";

/**
 * Returns true if the `changedFile` matches one of the _headers or _redirects files,
 * and the experimental support for these files is turned on.
 */
export function hasAssetsConfigChanged(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	publicDir: string,
	changedFilePath: string
) {
	if (!resolvedPluginConfig.experimental?.headersAndRedirectsDevModeSupport) {
		return false;
	}
	return [
		getRedirectsConfigPath(publicDir),
		getHeadersConfigPath(publicDir),
	].includes(changedFilePath);
}

/**
 * Computes the assets config that will be passed to Miniflare,
 * taking into account whether experimental _headers and _redirects support is on.
 */
export function getAssetsConfig(
	resolvedPluginConfig: AssetsOnlyResolvedConfig | WorkersResolvedConfig,
	entryWorkerConfig: ResolvedWorkerConfig | undefined,
	options: { publicDir: string; logger: DevLogger }
): AssetConfig {
	const assetsConfig =
		resolvedPluginConfig.type === "assets-only"
			? resolvedPluginConfig.config.assets
			: entryWorkerConfig?.assets;

	const workerConfig =
		resolvedPluginConfig.type === "assets-only"
			? resolvedPluginConfig.config
			: entryWorkerConfig;

	const config = {
		...(workerConfig?.compatibilityDate
			? { compatibility_date: workerConfig.compatibilityDate }
			: {}),
		...(workerConfig?.compatibilityFlags
			? { compatibility_flags: workerConfig.compatibilityFlags }
			: {}),
		...(assetsConfig?.htmlHandling
			? { html_handling: assetsConfig.htmlHandling }
			: {}),
		...(assetsConfig?.notFoundHandling
			? { not_found_handling: assetsConfig.notFoundHandling }
			: {}),
		...(assetsConfig?.basePath !== undefined
			? { base_path: assetsConfig.basePath }
			: {}),
		has_static_routing:
			resolvedPluginConfig.type === "workers" &&
			resolvedPluginConfig.staticRouting
				? true
				: false,
	} satisfies AssetConfig;

	if (!resolvedPluginConfig.experimental?.headersAndRedirectsDevModeSupport) {
		return config;
	}

	const logger: Logger = {
		debug() {
			/* No debug log in dev. */
		},
		log(message: string) {
			options.logger.info(message);
		},
		info(message: string) {
			options.logger.info(message);
		},
		warn(message: string) {
			options.logger.warn(message);
		},
		error(error: Error) {
			options.logger.error(error.message, { error });
		},
	};

	const redirectsFile = getRedirectsConfigPath(options.publicDir);
	const redirectsContents = maybeGetFile(redirectsFile);
	const redirects =
		redirectsContents &&
		RedirectsSchema.parse(
			constructRedirects({
				redirects: parseRedirects(redirectsContents, {
					htmlHandling: assetsConfig?.htmlHandling,
				}),
				redirectsFile,
				logger,
			}).redirects
		);

	const headersFile = getHeadersConfigPath(options.publicDir);
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

function getRedirectsConfigPath(publicDir: string): string {
	return path.join(publicDir, REDIRECTS_FILENAME);
}

function getHeadersConfigPath(publicDir: string): string {
	return path.join(publicDir, HEADERS_FILENAME);
}
