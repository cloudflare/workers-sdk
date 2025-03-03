import assert from "node:assert";
import path from "node:path";
import { syncAssets } from "../assets";
import { printBundleSize } from "../deployment-bundle/bundle-reporter";
import { getBundleType } from "../deployment-bundle/bundle-type";
import { withSourceURLs } from "../deployment-bundle/source-url";
import { getInferredHost } from "../dev";
import { UserError } from "../errors";
import { logger } from "../logger";
import { syncLegacyAssets } from "../sites";
import { requireApiToken } from "../user";
import { isAbortError } from "../utils/isAbortError";
import { getZoneIdForPreview } from "../zones";
import type { AssetsOptions } from "../assets";
import type { Route } from "../config/environment";
import type {
	CfModule,
	CfScriptFormat,
	CfWorkerContext,
	CfWorkerInit,
} from "../deployment-bundle/worker";
import type { ParseError } from "../parse";
import type { LegacyAssetPaths } from "../sites";
import type { CfAccount } from "./create-worker-preview";
import type { EsbuildBundle } from "./use-esbuild";

export function handlePreviewSessionUploadError(
	err: unknown,
	accountId: string
): boolean {
	assert(err && typeof err === "object");
	// we want to log the error, but not end the process
	// since it could recover after the developer fixes whatever's wrong
	// instead of logging the raw API error to the user,
	// give them friendly instructions
	if (isAbortError(err)) {
		// code 10049 happens when the preview token expires
		if ("code" in err && err.code === 10049) {
			logger.log("Preview token expired, fetching a new one");

			// since we want a new preview token when this happens,
			// lets increment the counter, and trigger a rerun of
			// the useEffect above
			return true;
		} else if (!handleUserFriendlyError(err as ParseError, accountId)) {
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
		const errorMessage =
			"Error: You need to register a workers.dev subdomain before running the dev command in remote mode";
		const solutionMessage =
			"You can either enable local mode by pressing l, or register a workers.dev subdomain here:";
		const onboardingLink = `https://dash.cloudflare.com/${accountId}/workers/onboarding`;
		logger.error(`${errorMessage}\n${solutionMessage}\n${onboardingLink}`);
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
	else if (isAbortError(err)) {
		logger.error("Error while creating remote dev session:", err);
	}
}

export type CfWorkerInitWithName = Required<Pick<CfWorkerInit, "name">> &
	CfWorkerInit;

export async function createRemoteWorkerInit(props: {
	bundle: EsbuildBundle;
	modules: CfModule[];
	accountId: string;
	name: string;
	legacyEnv: boolean | undefined;
	env: string | undefined;
	isWorkersSite: boolean;
	assets: AssetsOptions | undefined;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	format: CfScriptFormat;
	bindings: CfWorkerInit["bindings"];
	compatibilityDate: string | undefined;
	compatibilityFlags: string[] | undefined;
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

	const legacyAssets = await syncLegacyAssets(
		props.accountId,
		// When we're using the newer service environments, we wouldn't
		// have added the env name on to the script name. However, we must
		// include it in the kv namespace name regardless (since there's no
		// concept of service environments for kv namespaces yet).
		props.name + (!props.legacyEnv && props.env ? `-${props.env}` : ""),
		props.isWorkersSite ? props.legacyAssetPaths : undefined,
		true,
		false,
		undefined
	); // TODO: cancellable?

	if (legacyAssets.manifest) {
		modules.push({
			name: "__STATIC_CONTENT_MANIFEST",
			filePath: undefined,
			content: JSON.stringify(legacyAssets.manifest),
			type: "text",
		});
	}

	const assetsJwt = props.assets
		? await syncAssets(props.accountId, props.assets.directory, props.name)
		: undefined;

	const init: CfWorkerInitWithName = {
		name: props.name,
		main: {
			name: path.basename(props.bundle.path),
			filePath: props.bundle.path,
			type: getBundleType(props.format, path.basename(props.bundle.path)),
			content,
		},
		modules,
		bindings: {
			...props.bindings,
			kv_namespaces: (props.bindings.kv_namespaces || []).concat(
				legacyAssets.namespace
					? { binding: "__STATIC_CONTENT", id: legacyAssets.namespace }
					: []
			),
			text_blobs: {
				...props.bindings.text_blobs,
				...(legacyAssets.manifest &&
					props.format === "service-worker" && {
						__STATIC_CONTENT_MANIFEST: "__STATIC_CONTENT_MANIFEST",
					}),
			},
		},
		migrations: undefined, // no migrations in dev
		compatibility_date: props.compatibilityDate,
		compatibility_flags: props.compatibilityFlags,
		keepVars: true,
		keepSecrets: true,
		logpush: false,
		sourceMaps: undefined,
		assets:
			props.assets && assetsJwt
				? {
						jwt: assetsJwt,
						routingConfig: props.assets.routingConfig,
						assetConfig: props.assets.assetConfig,
					}
				: undefined,
		placement: undefined, // no placement in dev
		tail_consumers: undefined, // no tail consumers in dev - TODO revisit?
		limits: undefined, // no limits in preview - not supported yet but can be added
		observability: undefined, // no observability in dev
	};

	return init;
}

export async function getWorkerAccountAndContext(props: {
	accountId: string;
	env: string | undefined;
	legacyEnv: boolean | undefined;
	host: string | undefined;
	routes: Route[] | undefined;
	sendMetrics: boolean | undefined;
	configPath: string | undefined;
}): Promise<{ workerAccount: CfAccount; workerContext: CfWorkerContext }> {
	const workerAccount: CfAccount = {
		accountId: props.accountId,
		apiToken: requireApiToken(),
	};

	// What zone should the realish preview for this Worker run on?
	const zoneId = await getZoneIdForPreview({
		host: props.host,
		routes: props.routes,
		accountId: props.accountId,
	});

	const workerContext: CfWorkerContext = {
		env: props.env,
		legacyEnv: props.legacyEnv,
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
function handleUserFriendlyError(error: ParseError, accountId?: string) {
	switch ((error as unknown as { code: number }).code) {
		// code 10021 is a validation error
		case 10021: {
			// if it is the following message, give a more user friendly
			// error, otherwise do not handle this error in this function
			if (
				error.notes[0].text ===
				"binding DB of type d1 must have a valid `id` specified [code: 10021]"
			) {
				const errorMessage =
					"Error: You must use a real database in the preview_database_id configuration.";
				const solutionMessage =
					"You can find your databases using 'wrangler d1 list', or read how to develop locally with D1 here:";
				const documentationLink = `https://developers.cloudflare.com/d1/configuration/local-development`;

				logger.error(
					`${errorMessage}\n${solutionMessage}\n${documentationLink}`
				);

				return true;
			}

			return false;
		}

		// for error 10063 (workers.dev subdomain required)
		case 10063: {
			const errorMessage =
				"Error: You need to register a workers.dev subdomain before running the dev command in remote mode";
			const solutionMessage =
				"You can either enable local mode by pressing l, or register a workers.dev subdomain here:";
			const onboardingLink = accountId
				? `https://dash.cloudflare.com/${accountId}/workers/onboarding`
				: "https://dash.cloudflare.com/?to=/:account/workers/onboarding";

			logger.error(`${errorMessage}\n${solutionMessage}\n${onboardingLink}`);

			return true;
		}

		default: {
			return false;
		}
	}
}
