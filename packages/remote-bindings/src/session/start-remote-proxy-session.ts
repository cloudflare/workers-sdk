import { randomUUID } from "node:crypto";
import { createWorkerUploadForm } from "@cloudflare/deploy-helpers/create-worker-upload-form";
import { getAccessHeaders, getAuthFromEnv } from "@cloudflare/workers-auth";
import {
	APIError,
	fetchResultBase,
	getComplianceRegionSubdomain,
	isNonInteractiveOrCI,
	retryOnAPIFailure,
	UserError,
} from "@cloudflare/workers-utils";
import chalk from "chalk";
import { Log, LogLevel, Miniflare, Mutex, Response } from "miniflare";
import { fetch } from "undici";
import { version as packageVersion } from "../../package.json";
import { createDefaultAuthHook } from "../auth";
import { createRemoteBindingsLogger } from "../logger";
import {
	createPreviewSession,
	createWorkerPreview,
} from "../preview/create-worker-preview";
import {
	proxyServerWorkerContents,
	proxyWorkerContents,
} from "./worker-scripts";
import type { RemoteBindingsLogger } from "../logger";
import type {
	CfWorkerInitWithName,
	CfPreviewSession,
	CreateWorkerPreviewOptions,
} from "../preview/create-worker-preview";
import type {
	ProxyData,
	ProxyWorkerIncomingRequestBody,
	ProxyWorkerOutgoingRequestBody,
} from "./proxy-types";
import type {
	ApiCredentials,
	AsyncHook,
	Binding,
	CfAccount,
	CfWorkerContext,
	Config,
	LoggerLevel,
} from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

const PREVIEW_TOKEN_REFRESH_INTERVAL = 50 * 60 * 1000;

export type StartRemoteProxySessionOptions = {
	workerName?: string;
	auth?: AsyncHook<CfAccount, [Pick<Config, "account_id">]>;
	accountId?: string;
	/** Directory used to resolve auth profile directory bindings. */
	profileDir?: string;
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
	/** Logger used for lifecycle and runtime messages. */
	logger?: RemoteBindingsLogger;
};

export type RemoteProxySession = {
	ready: Promise<void>;
	updateBindings(bindings: Record<string, Binding>): Promise<void>;
	dispose(): Promise<void>;
	remoteProxyConnectionString: RemoteProxyConnectionString;
};

export async function startRemoteProxySession(
	bindings: Record<string, Binding> | undefined,
	options: StartRemoteProxySessionOptions = {}
): Promise<RemoteProxySession> {
	const logger = options.logger ?? createRemoteBindingsLogger();
	logger.log(chalk.dim("⎔ Establishing remote connection..."));

	const auth =
		options.auth ??
		createDefaultAuthHook(
			logger,
			options.accountId,
			options.complianceRegion,
			options.profileDir
		);
	const workerName = options.workerName ?? randomUUID();
	const proxy = new LocalProxy(logger);
	const preview = new RemotePreview({
		auth,
		accountId: options.accountId,
		complianceRegion: options.complianceRegion,
		logger,
		workerName,
	});
	const updateMutex = new Mutex();
	let disposed = false;
	let latestBindings = bindings ?? {};
	let activeProxyData: ProxyData | undefined;

	async function update(
		nextBindings: Record<string, Binding>,
		resetSession = false
	): Promise<void> {
		if (disposed) {
			throw new Error("Cannot update a disposed remote proxy session");
		}
		await proxy.send({ type: "pause" });
		try {
			const proxyData = await preview.upload(
				toRawBindings(nextBindings),
				resetSession
			);
			await proxy.send({ type: "play", proxyData });
			activeProxyData = proxyData;
			latestBindings = nextBindings;
		} catch (error) {
			if (activeProxyData) {
				await proxy.send({ type: "play", proxyData: activeProxyData });
				preview.scheduleRefresh();
			}
			throw error;
		}
	}

	function refresh(expiredProxyData?: ProxyData): void {
		logger.log(chalk.dim("⎔ Refreshing preview token..."));
		void updateMutex
			.runWith(async () => {
				if (
					expiredProxyData &&
					expiredProxyData.headers["cf-workers-preview-token"] !==
						activeProxyData?.headers["cf-workers-preview-token"]
				) {
					return;
				}
				await update(latestBindings, true);
				logger.log(chalk.green("✔ Preview token refreshed successfully"));
			})
			.catch((error) => logger.error("Failed to refresh preview token", error));
	}

	proxy.onPreviewTokenExpired = (proxyData) => refresh(proxyData);
	preview.onRefreshRequired = () => refresh(activeProxyData);

	try {
		await updateMutex.runWith(() => update(latestBindings));
	} catch (error) {
		await Promise.allSettled([preview.dispose(), proxy.dispose()]);
		if (error instanceof UserError) {
			throw error;
		}
		const message = getErrorMessage(error);
		throw new Error(
			`Failed to start the remote proxy session${message ? `: ${message}` : ""}`,
			{ cause: error }
		);
	}

	const remoteProxyConnectionString =
		(await proxy.ready) as RemoteProxyConnectionString;

	return {
		ready: Promise.resolve(),
		remoteProxyConnectionString,
		async updateBindings(newBindings) {
			await updateMutex.runWith(() => update(newBindings));
		},
		async dispose() {
			disposed = true;
			await updateMutex.drained();
			await Promise.all([preview.dispose(), proxy.dispose()]);
		},
	};
}

class RemotePreview {
	readonly #abortController = new AbortController();
	readonly #auth: NonNullable<StartRemoteProxySessionOptions["auth"]>;
	readonly #accountId: string | undefined;
	readonly #complianceRegion: Config["compliance_region"];
	readonly #logger: RemoteBindingsLogger;
	readonly #workerName: string;
	readonly #previewOptions: CreateWorkerPreviewOptions;
	#credentials: ApiCredentials | undefined;
	#session: CfPreviewSession | undefined;
	#refreshTimer: ReturnType<typeof setTimeout> | undefined;
	onRefreshRequired: () => void = () => {};

	constructor(options: {
		auth: NonNullable<StartRemoteProxySessionOptions["auth"]>;
		accountId: string | undefined;
		complianceRegion: Config["compliance_region"];
		logger: RemoteBindingsLogger;
		workerName: string;
	}) {
		this.#auth = options.auth;
		this.#accountId = options.accountId;
		this.#complianceRegion = options.complianceRegion;
		this.#logger = options.logger;
		this.#workerName = options.workerName;
		this.#previewOptions = this.#createPreviewOptions();
	}

	async upload(
		bindings: Record<string, Binding>,
		resetSession: boolean
	): Promise<ProxyData> {
		clearTimeout(this.#refreshTimer);
		const account = await this.#resolveAuth();
		this.#credentials = account.apiToken;
		const context: CfWorkerContext = {
			env: undefined,
			zone: undefined,
			host: undefined,
			routes: undefined,
			sendMetrics: undefined,
		};

		if (resetSession) {
			this.#session = undefined;
		}
		this.#session ??= await this.#createSession(account, context);

		let token;
		try {
			token = await this.#uploadWorker(account, context, bindings);
		} catch (error) {
			if (isAuthenticationError(error)) {
				throw new RemoteSessionAuthenticationError(error);
			}
			if (!(error instanceof APIError) || error.code !== 10049) {
				throw error;
			}
			this.#session = await this.#createSession(account, context);
			try {
				token = await this.#uploadWorker(account, context, bindings);
			} catch (retryError) {
				if (isAuthenticationError(retryError)) {
					throw new RemoteSessionAuthenticationError(retryError);
				}
				throw retryError;
			}
		}

		const accessHeaders = await getAccessHeaders(token.host, {
			logger: this.#logger,
			isNonInteractiveOrCI,
		});
		this.scheduleRefresh();

		return {
			userWorkerUrl: {
				protocol: "https:",
				hostname: token.host,
				port: "443",
			},
			headers: {
				"cf-workers-preview-token": token.value,
				...accessHeaders,
				"cf-connecting-ip": "",
			},
		};
	}

	async dispose(): Promise<void> {
		clearTimeout(this.#refreshTimer);
		this.#abortController.abort();
		this.#session = undefined;
	}

	scheduleRefresh(): void {
		clearTimeout(this.#refreshTimer);
		this.#refreshTimer = setTimeout(
			() => this.onRefreshRequired(),
			PREVIEW_TOKEN_REFRESH_INTERVAL
		);
	}

	async #resolveAuth(): Promise<CfAccount> {
		return await (typeof this.#auth === "function"
			? this.#auth({ account_id: this.#accountId })
			: this.#auth);
	}

	async #createSession(
		account: CfAccount,
		context: CfWorkerContext
	): Promise<CfPreviewSession> {
		this.#logger.log(chalk.dim("⎔ Starting remote preview..."));
		try {
			return await retryOnAPIFailure(
				() =>
					createPreviewSession(
						{ compliance_region: this.#complianceRegion },
						account,
						context,
						this.#abortController.signal,
						this.#workerName,
						this.#previewOptions
					),
				this.#logger,
				undefined,
				undefined,
				this.#abortController.signal
			);
		} catch (error) {
			if (isAuthenticationError(error)) {
				throw new RemoteSessionAuthenticationError(error);
			}
			throw error;
		}
	}

	async #uploadWorker(
		account: CfAccount,
		context: CfWorkerContext,
		bindings: Record<string, Binding>
	) {
		const session = this.#session;
		if (!session) {
			throw new Error("Missing remote preview session");
		}
		return retryOnAPIFailure(
			() =>
				createWorkerPreview(
					{ compliance_region: this.#complianceRegion },
					createProxyWorkerInit(this.#workerName, bindings),
					account,
					context,
					session,
					this.#abortController.signal,
					true,
					this.#previewOptions
				),
			this.#logger,
			undefined,
			undefined,
			this.#abortController.signal
		);
	}

	#createPreviewOptions(): CreateWorkerPreviewOptions {
		return {
			context: {
				fetch,
				fetchResult: (complianceConfig, resource, init, query, signal, token) =>
					fetchResultBase(
						complianceConfig,
						resource,
						init,
						`remote-bindings/${packageVersion}`,
						this.#logger,
						query,
						signal,
						token ?? this.#credentials
					),
				createWorkerUploadForm,
				getWorkersDevSubdomain: async (
					complianceConfig,
					accountId,
					options
				) => {
					const { subdomain } = await fetchResultBase<{ subdomain: string }>(
						complianceConfig,
						`/accounts/${accountId}/workers/subdomain`,
						undefined,
						`remote-bindings/${packageVersion}`,
						this.#logger,
						undefined,
						options.abortSignal,
						this.#credentials
					);
					return `${subdomain}${getComplianceRegionSubdomain(complianceConfig)}.workers.dev`;
				},
				getAccessHeaders: (hostname) =>
					getAccessHeaders(hostname, {
						logger: this.#logger,
						isNonInteractiveOrCI,
					}),
				logger: this.#logger,
			},
		};
	}
}

class LocalProxy {
	readonly #logger: RemoteBindingsLogger;
	readonly #miniflare: Miniflare;
	readonly #mutex = new Mutex();
	readonly #secret = randomUUID();
	readonly ready: Promise<URL>;
	onPreviewTokenExpired: (proxyData: ProxyData) => void = () => {};

	constructor(logger: RemoteBindingsLogger) {
		this.#logger = logger;
		this.#miniflare = new Miniflare({
			port: 0,
			stripDisablePrettyError: false,
			unsafeLocalExplorer: false,
			workers: [
				{
					name: "ProxyWorker",
					compatibilityDate: "2023-12-18",
					compatibilityFlags: ["nodejs_compat"],
					modules: [
						{
							type: "ESModule",
							path: "ProxyWorker.mjs",
							contents: proxyWorkerContents,
						},
					],
					durableObjects: {
						DURABLE_OBJECT: {
							className: "ProxyWorker",
							unsafePreventEviction: true,
						},
					},
					stripCfConnectingIp: false,
					serviceBindings: {
						PROXY_CONTROLLER: async (request): Promise<Response> => {
							this.#handleMessage(
								(await request.json()) as ProxyWorkerOutgoingRequestBody
							);
							return new Response(null, { status: 204 });
						},
					},
					bindings: { PROXY_CONTROLLER_AUTH_SECRET: this.#secret },
					cache: false,
					unsafeEphemeralDurableObjects: true,
				},
			],
			verbose: logger.loggerLevel === "debug",
			log: new RemoteProxyLog(toMiniflareLogLevel(logger.loggerLevel), logger),
			liveReload: false,
		});
		this.ready = this.#miniflare.ready;
	}

	async send(
		message: ProxyWorkerIncomingRequestBody,
		retries = 3
	): Promise<void> {
		try {
			await this.#mutex.runWith(async () => {
				await this.ready;
				await this.#miniflare.dispatchFetch(
					`http://dummy/cdn-cgi/ProxyWorker/${message.type}`,
					{
						headers: { Authorization: this.#secret },
						cf: { hostMetadata: message },
					}
				);
			});
		} catch (error) {
			if (retries > 0) {
				return this.send(message, retries - 1);
			}
			throw error;
		}
	}

	async dispose(): Promise<void> {
		await this.#mutex.drained();
		await this.#miniflare.dispose();
	}

	#handleMessage(message: ProxyWorkerOutgoingRequestBody): void {
		switch (message.type) {
			case "previewTokenExpired":
				this.onPreviewTokenExpired(message.proxyData);
				break;
			case "error":
				this.#logger.error("Error inside ProxyWorker", message.error);
				break;
			case "debug-log":
				this.#logger.debug("[ProxyWorker]", ...message.args);
				break;
			case "sseResponseDetected":
				break;
		}
	}
}

class RemoteProxyLog extends Log {
	constructor(
		level: LogLevel,
		private readonly logger: RemoteBindingsLogger
	) {
		super(level, { prefix: "remote-bindings" });
	}

	protected log(message: string): void {
		this.logger.debug(message);
	}
}

class RemoteSessionAuthenticationError extends UserError {
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

function createProxyWorkerInit(
	name: string,
	bindings: Record<string, Binding>
): CfWorkerInitWithName {
	return {
		name,
		main: {
			name: "ProxyServerWorker.mjs",
			filePath: "ProxyServerWorker.mjs",
			type: "esm",
			content: proxyServerWorkerContents,
		},
		modules: [],
		bindings,
		migrations: undefined,
		exports: undefined,
		compatibility_date: "2025-04-28",
		compatibility_flags: undefined,
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
}

function toRawBindings(
	bindings: Record<string, Binding>
): Record<string, Binding> {
	return Object.fromEntries(
		Object.entries(bindings).map(([key, binding]) => [
			key,
			{ ...binding, raw: true },
		])
	);
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

function isAuthenticationError(error: unknown): boolean {
	return (
		error instanceof APIError && (error.code === 9106 || error.code === 10000)
	);
}

function getErrorMessage(error: unknown): string | undefined {
	if (error instanceof Error) {
		return getErrorMessage(error.cause) ?? error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	return undefined;
}
