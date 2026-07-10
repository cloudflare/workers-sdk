import path from "node:path";
import { createWorkerUploadForm } from "@cloudflare/deploy-helpers";
import { getAccessHeaders, getAuthFromEnv } from "@cloudflare/workers-auth";
import {
	APIError,
	fetchResultBase,
	getComplianceRegionSubdomain,
	isNonInteractiveOrCI,
	retryOnAPIFailure as retryOnAPIFailureWithLogger,
	UserError,
} from "@cloudflare/workers-utils";
import { Log, LogLevel } from "miniflare";
import { fetch } from "undici";
import { version as packageVersion } from "../../package.json";
import { DevEnv } from "../internal/dev-env/DevEnv";
import { ProxyController } from "../internal/dev-env/ProxyController";
import { RemoteRuntimeController } from "../internal/dev-env/RemoteRuntimeController";
import {
	createPreviewSession as createPreviewSessionWithContext,
	createWorkerPreview as createWorkerPreviewWithContext,
} from "../preview/create-worker-preview";
import { RemoteBundlerController } from "./RemoteBundlerController";
import { RemoteConfigController } from "./RemoteConfigController";
import type { ErrorEvent } from "../internal/dev-env/events";
import type { ProxyControllerContext } from "../internal/dev-env/ProxyController";
import type { RemoteRuntimeControllerContext } from "../internal/dev-env/RemoteRuntimeController";
import type { RemoteBindingsLogger } from "../logger";
import type { CfAccount } from "../preview/create-worker-preview";
import type { CreateWorkerPreviewOptions } from "../preview/create-worker-preview";
import type {
	ApiCredentials,
	CfWorkerInitWithName,
	LoggerLevel,
} from "@cloudflare/workers-utils";
import type { URLSearchParams } from "node:url";

export class RemoteSessionAuthenticationError extends UserError {
	constructor(cause: unknown) {
		const envAuth = getAuthFromEnv();
		let errorMessage =
			"Failed to establish remote session due to an authentication issue.\n";
		if (envAuth !== undefined) {
			const method =
				"apiToken" in envAuth
					? "a custom API token (`CLOUDFLARE_API_TOKEN`)"
					: "a Global API Key (`CLOUDFLARE_API_KEY`)";
			errorMessage +=
				`It looks like you are authenticating via ${method} set in an environment variable.\n` +
				"The token may be invalid or lack the required permissions for this operation.\n\n" +
				"To fix this, verify that your token is valid and has the correct permissions.\n" +
				"You can also run `wrangler whoami` to check your current authentication status.";
		} else {
			errorMessage +=
				"Your credentials may have expired or been revoked.\n\n" +
				"To fix this, try to:\n" +
				"  - Run `wrangler whoami` to check your current authentication status.\n" +
				"  - Run `wrangler logout` and then `wrangler login` to re-authenticate.";
		}
		super(errorMessage, {
			cause,
			telemetryMessage: "remote dev authentication error",
		});
	}
}

export class RemoteProxyDevEnv extends DevEnv {
	constructor(logger: RemoteBindingsLogger, accountId?: string) {
		super({
			configFactory: (devEnv) => new RemoteConfigController(devEnv, accountId),
			bundlerFactory: (devEnv) => new RemoteBundlerController(devEnv),
			runtimeFactories: [
				(devEnv) =>
					new RemoteRuntimeController(
						devEnv,
						createRemoteRuntimeContext(logger)
					),
			],
			proxyFactory: (devEnv) =>
				new ProxyController(devEnv, createProxyControllerContext(logger)),
			context: {
				logger,
				initialize() {},
				handleErrorEvent(devEnv, event: ErrorEvent) {
					devEnv.emit("error", event);
				},
				runWithLogLevel(_level, callback) {
					return callback();
				},
			},
		});
	}
}

function createRemoteRuntimeContext(
	logger: RemoteBindingsLogger
): RemoteRuntimeControllerContext {
	let credentials: ApiCredentials | undefined;
	const previewOptions: CreateWorkerPreviewOptions = {
		context: {
			fetch,
			async fetchResult<ResponseType>(
				complianceConfig: Parameters<typeof fetchResultBase>[0],
				resource: string,
				init?: Parameters<typeof fetchResultBase>[2],
				queryParams?: URLSearchParams,
				abortSignal?: AbortSignal,
				apiToken?: ApiCredentials
			): Promise<ResponseType> {
				credentials = apiToken ?? credentials;
				return fetchResultBase<ResponseType>(
					complianceConfig,
					resource,
					init,
					`remote-bindings/${packageVersion}`,
					logger,
					queryParams,
					abortSignal,
					credentials
				);
			},
			createWorkerUploadForm,
			getWorkersDevSubdomain: async (complianceConfig, accountId, options) => {
				const { subdomain } = await fetchResultBase<{ subdomain: string }>(
					complianceConfig,
					`/accounts/${accountId}/workers/subdomain`,
					undefined,
					`remote-bindings/${packageVersion}`,
					logger,
					undefined,
					options.abortSignal,
					credentials
				);
				return `${subdomain}${getComplianceRegionSubdomain(complianceConfig)}.workers.dev`;
			},
			getAccessHeaders: (hostname) =>
				getAccessHeaders(hostname, {
					logger,
					isNonInteractiveOrCI,
				}),
			logger,
		},
	};

	return {
		createPreviewSession(complianceConfig, account, context, signal, name) {
			return createPreviewSessionWithContext(
				complianceConfig,
				account,
				context,
				signal,
				name,
				previewOptions
			);
		},
		createWorkerPreview(
			complianceConfig,
			init,
			account,
			context,
			session,
			signal,
			minimalMode
		) {
			return createWorkerPreviewWithContext(
				complianceConfig,
				init,
				account,
				context,
				session,
				signal,
				minimalMode,
				previewOptions
			);
		},
		async createRemoteWorkerInit(props): Promise<CfWorkerInitWithName> {
			return {
				name: props.name,
				main: {
					name: path.basename(props.bundle.path),
					filePath: props.bundle.path,
					type: props.bundle.type,
					content: props.bundle.entrypointSource,
				},
				modules: props.modules,
				bindings: props.bindings,
				migrations: undefined,
				exports: undefined,
				compatibility_date: props.compatibilityDate,
				compatibility_flags: props.compatibilityFlags,
				keepVars: true,
				keepSecrets: true,
				logpush: false,
				sourceMaps: undefined,
				containers: undefined,
				assets: undefined,
				placement: undefined,
				tail_consumers: undefined,
				streaming_tail_consumers: undefined,
				limits: undefined,
				observability: undefined,
				cache: undefined,
			};
		},
		async getWorkerAccountAndContext(props) {
			const workerAccount: CfAccount = {
				accountId: props.accountId,
				apiToken: props.apiToken ?? requireCredentials(credentials),
			};
			return {
				workerAccount,
				workerContext: {
					env: props.env,
					useServiceEnvironments: props.useServiceEnvironments,
					zone: undefined,
					host: props.host,
					routes: props.routes,
					sendMetrics: props.sendMetrics,
				},
			};
		},
		handlePreviewSessionCreationError(error) {
			if (isAuthenticationError(error)) {
				throw new RemoteSessionAuthenticationError(error);
			}
		},
		handlePreviewSessionUploadError(error) {
			if (isAuthenticationError(error)) {
				throw new RemoteSessionAuthenticationError(error);
			}
			return error instanceof APIError && error.code === 10049;
		},
		logger,
		getAccessHeaders: (hostname) =>
			getAccessHeaders(hostname, {
				logger,
				isNonInteractiveOrCI,
			}),
		retryOnAPIFailure(action, backoff, attempts, abortSignal) {
			return retryOnAPIFailureWithLogger(
				action,
				logger,
				backoff,
				attempts,
				abortSignal
			);
		},
		packageVersion,
		tailProtocol: "trace-v1",
		tailHandler() {},
	};
}

function createProxyControllerContext(
	logger: RemoteBindingsLogger
): ProxyControllerContext {
	return {
		logger,
		packageVersion,
		validateHttpsOptions: () => undefined,
		logConsoleMessage() {},
		maybeHandleNetworkLoadResource: () => undefined,
		getSourceMappedStack: () => "",
		createProxyControllerLogger: (localServerReady) =>
			new RemoteProxyLog(
				toMiniflareLogLevel(logger.loggerLevel),
				logger,
				localServerReady
			),
		handleStructuredLogs() {},
	};
}

class RemoteProxyLog extends Log {
	constructor(
		level: LogLevel,
		private readonly logger: RemoteBindingsLogger,
		private readonly localServerReady: Promise<void>
	) {
		super(level, { prefix: "remote-bindings" });
	}

	protected log(message: string): void {
		this.logger.debug(message);
	}

	logReady(message: string): void {
		this.localServerReady.then(() => super.logReady(message)).catch(() => {});
	}
}

function toMiniflareLogLevel(level: LoggerLevel): LogLevel {
	switch (level) {
		case "debug":
			return LogLevel.DEBUG;
		case "none":
			return LogLevel.NONE;
		default:
			return LogLevel.ERROR;
	}
}

function requireCredentials(
	credentials: ApiCredentials | undefined
): ApiCredentials {
	if (!credentials) {
		throw new UserError("Missing API credentials for remote bindings", {
			telemetryMessage: "remote bindings api credentials missing",
		});
	}
	return credentials;
}

function isAuthenticationError(error: unknown): boolean {
	return (
		error instanceof APIError && (error.code === 9106 || error.code === 10000)
	);
}
