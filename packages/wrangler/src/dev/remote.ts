import assert from "node:assert";
import path from "node:path";
import { helpIfErrorIsSizeOrScriptStartup } from "../deploy/deploy";
import { printBundleSize } from "../deployment-bundle/bundle-reporter";
import { getBundleType } from "../deployment-bundle/bundle-type";
import { withSourceURLs } from "../deployment-bundle/source-url";
import { getInferredHost } from "../dev";
import { UserError } from "../errors";
import { logger } from "../logger";
import { syncLegacyAssets } from "../sites";
import {
	getAccountChoices,
	requireApiToken,
	saveAccountToCache,
} from "../user";
import { getAccessToken } from "../user/access";
import { isAbortError } from "../utils/isAbortError";
import { getZoneIdForPreview } from "../zones";
import {
	createPreviewSession,
	createWorkerPreview,
} from "./create-worker-preview";
import { startPreviewServer } from "./proxy";
import type { ProxyData } from "../api";
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

interface RemoteProps {
	name: string | undefined;
	bundle: EsbuildBundle | undefined;
	format: CfScriptFormat | undefined;
	isWorkersSite: boolean;
	legacyAssetPaths: LegacyAssetPaths | undefined;
	port: number;
	ip: string;
	localProtocol: "https" | "http";
	httpsKeyPath: string | undefined;
	httpsCertPath: string | undefined;
	inspect: boolean;
	inspectorPort: number;
	accountId: string | undefined;
	bindings: CfWorkerInit["bindings"];
	compatibilityDate: string;
	compatibilityFlags: string[] | undefined;
	usageModel: "bundled" | "unbound" | undefined;
	env: string | undefined;
	legacyEnv: boolean | undefined;
	host: string | undefined;
	routes: Route[] | undefined;
	onReady?:
		| ((ip: string, port: number, proxyData: ProxyData) => void)
		| undefined;
	sourceMapPath: string | undefined;
	sendMetrics: boolean | undefined;

	setAccountId: (accountId: string) => void;
}

export async function startRemoteServer(props: RemoteProps) {
	let accountId = props.accountId;
	if (accountId === undefined) {
		const accountChoices = await getAccountChoices();
		if (accountChoices.length === 1) {
			saveAccountToCache({
				id: accountChoices[0].id,
				name: accountChoices[0].name,
			});
			accountId = accountChoices[0].id;
		} else {
			const error = new UserError(
				"In a non-interactive environment, it is mandatory to specify an account ID, either by assigning its value to CLOUDFLARE_ACCOUNT_ID, or as `account_id` in your `wrangler.toml` file."
			);
			logger.error(error.message);
			throw error;
		}
	}

	const previewToken = await getRemotePreviewToken({
		...props,
		accountId: accountId,
	});

	if (previewToken === undefined) {
		const error = new Error("Failed to get a previewToken");
		logger.error(error.message);
		throw error;
	}
	// start our proxy server
	const previewServer = await startPreviewServer({
		previewToken,
		assetDirectory: props.isWorkersSite
			? undefined
			: props.legacyAssetPaths?.assetDirectory,
		localProtocol: props.localProtocol,
		customHttpsKeyPath: props.httpsKeyPath,
		customHttpsCertPath: props.httpsCertPath,
		localPort: props.port,
		ip: props.ip,
		onReady: async (ip, port) => {
			const accessToken = await getAccessToken(previewToken.host);

			const proxyData: ProxyData = {
				userWorkerUrl: {
					protocol: "https:",
					hostname: previewToken.host,
					port: "443",
				},
				userWorkerInspectorUrl: {
					protocol: previewToken.inspectorUrl.protocol,
					hostname: previewToken.inspectorUrl.hostname,
					port: previewToken.inspectorUrl.port.toString(),
					pathname: previewToken.inspectorUrl.pathname,
				},
				userWorkerInnerUrlOverrides: {
					hostname: props.host,
					port: props.port.toString(),
				},
				headers: {
					"cf-workers-preview-token": previewToken.value,
					...(accessToken ? { Cookie: `CF_Authorization=${accessToken}` } : {}),
				},
				liveReload: false, // liveReload currently disabled in remote-mode, but will be supported with startDevWorker
				proxyLogsToController: true,
				entrypointAddresses: undefined,
			};

			props.onReady?.(ip, port, proxyData);
		},
	});
	if (!previewServer) {
		const error = new Error("Failed to start remote server");
		logger.error(error);
		throw error;
	}
	return { stop: previewServer.stop };
}

/**
 * getRemotePreviewToken is a react-free version of `useWorker`.
 * It returns a preview token, which we then use in our proxy server
 */
export async function getRemotePreviewToken(props: RemoteProps) {
	//setup the preview session
	async function start() {
		if (props.accountId === undefined) {
			const error = new Error("no accountId provided");
			logger.error(error.message);
			throw error;
		}
		const abortController = new AbortController();
		const { workerAccount, workerContext } = await getWorkerAccountAndContext({
			accountId: props.accountId,
			env: props.env,
			legacyEnv: props.legacyEnv,
			host: props.host,
			routes: props.routes,
			sendMetrics: props.sendMetrics,
		});
		const session = await createPreviewSession(
			workerAccount,
			workerContext,
			abortController.signal
		);
		//use the session to upload the worker, and create a preview

		if (session === undefined) {
			const error = new Error("Failed to start a session");
			logger.error(error.message);
			throw error;
		}
		if (!props.bundle || !props.format) {
			return;
		}

		const init = await createRemoteWorkerInit({
			bundle: props.bundle,
			modules: props.bundle ? props.bundle.modules : [],
			accountId: props.accountId,
			name: props.name,
			legacyEnv: props.legacyEnv,
			env: props.env,
			isWorkersSite: props.isWorkersSite,
			legacyAssetPaths: props.legacyAssetPaths,
			format: props.format,
			bindings: props.bindings,
			compatibilityDate: props.compatibilityDate,
			compatibilityFlags: props.compatibilityFlags,
		});
		const workerPreviewToken = await createWorkerPreview(
			init,
			workerAccount,
			workerContext,
			session,
			abortController.signal
		);
		return workerPreviewToken;
	}
	return start().catch((err) => {
		// we want to log the error, but not end the process
		// since it could recover after the developer fixes whatever's wrong
		// instead of logging the raw API error to the user,
		// give them friendly instructions
		if (isAbortError(err)) {
			// code 10049 happens when the preview token expires
			if (err.code === 10049) {
				logger.log("Preview token expired, restart server to fetch a new one");
			} else if (!handleUserFriendlyError(err, props.accountId)) {
				helpIfErrorIsSizeOrScriptStartup(err, props.bundle?.dependencies || {});
				logger.error("Error on remote worker:", err);
			}
		}
	});
}

export async function createRemoteWorkerInit(props: {
	bundle: EsbuildBundle;
	modules: CfModule[];
	accountId: string;
	name: string | undefined;
	legacyEnv: boolean | undefined;
	env: string | undefined;
	isWorkersSite: boolean;
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

	const init: CfWorkerInit = {
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
		placement: undefined, // no placement in dev
		tail_consumers: undefined, // no tail consumers in dev - TODO revisit?
		limits: undefined, // no limits in preview - not supported yet but can be added
		assets: undefined, // no remote mode for assets
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
		host: props.host ?? getInferredHost(props.routes),
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
export function handleUserFriendlyError(error: ParseError, accountId?: string) {
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
