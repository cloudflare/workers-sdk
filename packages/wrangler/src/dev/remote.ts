import assert from "node:assert";
import path from "node:path";
import { APIError, UserError } from "@cloudflare/workers-utils";
import { syncAssets } from "../assets";
import { printBundleSize } from "../deployment-bundle/bundle-reporter";
import { getBundleType } from "../deployment-bundle/bundle-type";
import { withSourceURLs } from "../deployment-bundle/source-url";
import { getInferredHost } from "../dev";
import { logger } from "../logger";
import { syncWorkersSite } from "../sites";
import { requireApiToken } from "../user";
import { isAbortError } from "../utils/isAbortError";
import { getZoneIdForPreview } from "../zones";
import type { StartDevWorkerInput } from "../api";
import type { AssetsOptions } from "../assets";
import type { LegacyAssetPaths } from "../sites";
import type { ApiCredentials } from "../user";
import type { CfAccount } from "./create-worker-preview";
import type { EsbuildBundle } from "./use-esbuild";
import type {
	CfModule,
	CfScriptFormat,
	CfWorkerContext,
	CfWorkerInit,
	ComplianceConfig,
	Route,
} from "@cloudflare/workers-utils";

export function handlePreviewSessionUploadError(
	err: unknown,
	accountId: string
): boolean {
	assert(err && typeof err === "object");
	// we want to log the error, but not end the process
	// since it could recover after the developer fixes whatever's wrong
	// instead of logging the raw API error to the user,
	// give them friendly instructions
	if (!isAbortError(err)) {
		// code 10049 happens when the preview token expires
		if ("code" in err && err.code === 10049) {
			logger.log("Preview token expired, fetching a new one");

			// since we want a new preview token when this happens,
			// lets increment the counter, and trigger a rerun of
			// the useEffect above
			return true;
		} else if (!handleUserFriendlyError(err, accountId)) {
			logger.error("Error on remote worker:", err);
		}
	}
	return false;
}

export function handlePreviewSessionCreationError(
	err: unknown,
	accountId: string
) {
	assert(err && typeof err === "object");
	// instead of logging the raw API error to the user,
	// give them friendly instructions
	// for error 10063 (workers.dev subdomain required)
	if ("code" in err && err.code === 10063) {
		logger.error(
			`You need to register a workers.dev subdomain before running the dev command in remote mode. You can either enable local mode by pressing l, or register a workers.dev subdomain here: https://dash.cloudflare.com/${accountId}/workers/onboarding`
		);
	} else if (
		"cause" in err &&
		(err.cause as { code: string; hostname: string })?.code === "ENOTFOUND"
	) {
		logger.error(
			`Could not access \`${(err.cause as { code: string; hostname: string }).hostname}\`. Make sure the domain is set up to be proxied by Cloudflare.\nFor more details, refer to https://developers.cloudflare.com/workers/configuration/routing/routes/#set-up-a-route`
		);
	} else if (err instanceof UserError) {
		logger.error(err.message);
	}
	// we want to log the error, but not end the process
	// since it could recover after the developer fixes whatever's wrong
	else if (!isAbortError(err)) {
		logger.error("Error while creating remote dev session:", err);
	}
}

export type CfWorkerInitWithName = Required<Pick<CfWorkerInit, "name">> &
	Omit<CfWorkerInit, "bindings"> & {
		bindings: StartDevWorkerInput["bindings"];
	};

/**
 * Create remote worker init from StartDevWorkerInput["bindings"] format
 * (flat Record<string, Binding>).
 */
export async function createRemoteWorkerInit(props: {
	bundle: EsbuildBundle;
	modules: CfModule[];
	complianceConfig: ComplianceConfig;
	accountId: string;
	name: string;
	useServiceEnvironments: boolean | undefined;
	env: string | undefined;
	isWorkersSite: boolean;
	assets: AssetsOptions | undefined;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	format: CfScriptFormat;
	bindings: StartDevWorkerInput["bindings"];
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
	minimal_mode?: boolean;
}) {
	const { entrypointSource: content, modules } = withSourceURLs(
		props.bundle.path,
		props.bundle.entrypointSource,
		props.modules
	);

	// TODO: For Dev we could show the reporter message in the interactive box.
	void printBundleSize(
		{
			name: path.basename(props.bundle.path),
			content,
		},
		props.modules
	);

	const workersSitesAssets = await syncWorkersSite(
		props.complianceConfig,
		props.accountId,
		// When we're using the newer service environments, we wouldn't
		// have added the env name on to the script name. However, we must
		// include it in the kv namespace name regardless (since there's no
		// concept of service environments for kv namespaces yet).
		props.name +
			(props.useServiceEnvironments && props.env ? `-${props.env}` : ""),
		props.isWorkersSite ? props.legacyAssetPaths : undefined,
		true,
		false,
		undefined
	); // TODO: cancellable?

	if (workersSitesAssets.manifest) {
		modules.push({
			name: "__STATIC_CONTENT_MANIFEST",
			filePath: undefined,
			content: JSON.stringify(workersSitesAssets.manifest),
			type: "text",
		});
	}

	const assetsJwt = props.assets
		? await syncAssets(
				props.complianceConfig,
				props.accountId,
				props.assets.directory,
				props.name
			)
		: undefined;

	const bindings = { ...props.bindings };

	if (workersSitesAssets.namespace) {
		bindings["__STATIC_CONTENT"] = {
			type: "kv_namespace",
			id: workersSitesAssets.namespace,
		};
	}

	if (workersSitesAssets.manifest && props.format === "service-worker") {
		bindings["__STATIC_CONTENT_MANIFEST"] = {
			type: "text_blob",
			source: { contents: "__STATIC_CONTENT_MANIFEST" },
		};
	}

	const init: CfWorkerInitWithName = {
		name: props.name,
		main: {
			name: path.basename(props.bundle.path),
			filePath: props.bundle.path,
			type: getBundleType(props.format, path.basename(props.bundle.path)),
			content,
		},
		modules,
		bindings,
		migrations: undefined, // no migrations in dev
		compatibility_date: props.compatibilityDate,
		compatibility_flags: props.compatibilityFlags,
		keepVars: true,
		keepSecrets: true,
		logpush: false,
		sourceMaps: undefined,
		containers: undefined, // Containers are not supported in remote dev mode
		assets:
			props.assets && assetsJwt
				? {
						jwt: assetsJwt,
						routerConfig: props.assets.routerConfig,
						assetConfig: props.assets.assetConfig,
						_redirects: props.assets._redirects,
						_headers: props.assets._headers,
						run_worker_first: props.assets.run_worker_first,
					}
				: undefined,
		placement: undefined, // no placement in dev
		tail_consumers: undefined,
		streaming_tail_consumers: undefined,
		limits: undefined, // no limits in preview - not supported yet but can be added
		observability: undefined, // no observability in dev,
	};

	return init;
}

export async function getWorkerAccountAndContext(props: {
	complianceConfig: ComplianceConfig;
	accountId: string;
	apiToken?: ApiCredentials | undefined;
	env: string | undefined;
	useServiceEnvironments: boolean | undefined;
	host: string | undefined;
	routes: Route[] | undefined;
	sendMetrics: boolean | undefined;
	configPath: string | undefined;
}): Promise<{ workerAccount: CfAccount; workerContext: CfWorkerContext }> {
	const workerAccount: CfAccount = {
		accountId: props.accountId,
		apiToken: props.apiToken ?? requireApiToken(),
	};

	// What zone should the realish preview for this Worker run on?
	const zoneId = await getZoneIdForPreview(props.complianceConfig, {
		host: props.host,
		routes: props.routes,
		accountId: props.accountId,
	});

	const workerContext: CfWorkerContext = {
		env: props.env,
		useServiceEnvironments: props.useServiceEnvironments,
		zone: zoneId,
		host: props.host ?? getInferredHost(props.routes, props.configPath),
		routes: props.routes,
		sendMetrics: props.sendMetrics,
	};

	return { workerAccount, workerContext };
}

/**
 * A switch for handling thrown error mappings to user friendly
 * messages, does not perform any logic other than logging errors.
 * @returns if the error was handled or not
 */
function handleUserFriendlyError(error: unknown, accountId?: string) {
	if (error instanceof APIError) {
		switch (error.code) {
			// code 10021 is a validation error
			case 10021: {
				// if it is the following message, give a more user friendly
				// error, otherwise do not handle this error in this function
				if (
					error.notes[0].text ===
					"binding DB of type d1 must have a valid `id` specified [code: 10021]"
				) {
					logger.error(
						`You must use a real database in the preview_database_id configuration. You can find your databases using 'wrangler d1 list', or read how to develop locally with D1 here: https://developers.cloudflare.com/d1/configuration/local-development`
					);

					return true;
				}

				return false;
			}

			// for error 10063 (workers.dev subdomain required)
			case 10063: {
				const onboardingLink = accountId
					? `https://dash.cloudflare.com/${accountId}/workers/onboarding`
					: "https://dash.cloudflare.com/?to=/:account/workers/onboarding";

				logger.error(
					`You need to register a workers.dev subdomain before running the dev command in remote mode. You can either enable local mode by pressing l, or register a workers.dev subdomain here: ${onboardingLink}`
				);

				return true;
			}

			default: {
				logger.error(error);
				return true;
			}
		}
	}
}
