import { randomUUID } from "node:crypto";
import events from "node:events";
import { UserError } from "@cloudflare/workers-utils";
import chalk from "chalk";
import { DeferredPromise } from "miniflare";
import remoteBindingsWorkerSource from "worker:remoteBindings/ProxyServerWorker";
import { getRemoteBindingsAuthHook } from "./auth";
import { initLogger } from "./logger";
import { DevEnv } from "./startDevWorker/DevEnv";
import { isBun } from "./utils/is-bun";
import { RemoteSessionAuthenticationError } from "./utils/remote";
import type { RemoteBindingsLogger } from "./logger";
import type {
	AsyncHook,
	CfAccount,
	Config,
	StartDevWorkerInput,
} from "@cloudflare/workers-utils";
import type { RemoteProxyConnectionString } from "miniflare";

type ErrorEvent = {
	type: "error";
	reason: string;
	cause: unknown;
};

export type StartRemoteProxySessionOptions = {
	workerName?: string;
	auth?: AsyncHook<CfAccount>;
	/** If running in a non-public compliance region, set this here. */
	complianceRegion?: Config["compliance_region"];
	/** Consumer name used in actionable error messages. */
	cliDisplayName: string;
	logger: RemoteBindingsLogger;
};

function isErrorEvent(error: unknown): error is ErrorEvent {
	return (
		typeof error === "object" &&
		error !== null &&
		"type" in error &&
		error.type === "error" &&
		"reason" in error &&
		"cause" in error
	);
}

function getErrorMessage(error: unknown): string | undefined {
	if (error instanceof Error) {
		return getErrorMessage(error.cause) ?? error.message;
	}
	if (typeof error === "string") {
		return error;
	}
	if (typeof error === "object" && error !== null) {
		const maybeMessage = (error as { message?: unknown }).message;
		if (typeof maybeMessage === "string") {
			const maybeCause = (error as { cause?: unknown }).cause;
			return getErrorMessage(maybeCause) ?? maybeMessage;
		}
	}
	return undefined;
}

function formatRemoteProxySessionError(error: unknown): string | undefined {
	if (isErrorEvent(error)) {
		const causeMessage = getErrorMessage(error.cause);
		return causeMessage ? `${error.reason}: ${causeMessage}` : error.reason;
	}
	return getErrorMessage(error);
}

/**
 * Turns an error raised while the remote proxy session starts into the error
 * to throw. A UserError emitted directly (e.g. the Miniflare user-error case
 * that DevEnv re-emits), and a RemoteSessionAuthenticationError found in the
 * error event's cause chain, are surfaced verbatim so callers can still branch
 * on `instanceof UserError` and the user sees a single actionable message.
 * Everything else — including generic API errors — is wrapped.
 *
 * @param error The error the session emitted during startup.
 * @returns The error to throw.
 */
function toStartupError(error: unknown): Error {
	if (error instanceof UserError) {
		return error;
	}
	const authError = findRemoteSessionAuthError(error);
	if (authError) {
		return authError;
	}
	const details = formatRemoteProxySessionError(error);
	return new Error(
		details
			? `Failed to start the remote proxy session. ${details}`
			: "Failed to start the remote proxy session. There is likely additional logging output above.",
		{ cause: error }
	);
}

/**
 * The error for a remote proxy session that cannot work under Bun. Bun's
 * `fetch()` ignores the undici `dispatcher` that Miniflare routes the session's
 * control messages through, so the local proxy never learns where to forward
 * binding requests.
 *
 * @param cause The failure that showed it, if one was reported.
 * @returns A UserError explaining the limitation and the way around it.
 */
function createBunRemoteBindingsError(cause: unknown): UserError {
	return new UserError(
		"Remote bindings cannot work under Bun yet. Bun's `fetch()` ignores the undici `dispatcher` that Miniflare uses to reach the remote proxy session (https://github.com/oven-sh/bun/issues/39247), so every request to a remote binding would wait forever. Run this under Node.js, or turn remote bindings off.",
		{
			cause,
			telemetryMessage: "remote proxy session bun control message failed",
		}
	);
}

/**
 * The error for a `play` message that never reached the ProxyWorker. Until it
 * arrives, the ProxyWorker queues every binding request, so callers would wait
 * forever if the session carried on.
 *
 * @param cause The send failure ProxyController recorded, if any.
 * @returns The Bun-specific UserError under Bun, otherwise a startup error.
 */
function createPlayNotDeliveredError(cause: unknown): Error {
	if (isBun()) {
		return createBunRemoteBindingsError(cause);
	}
	return cause !== undefined
		? toStartupError(cause)
		: new Error(
				"Failed to start the remote proxy session. Its local proxy never received the session. There is likely additional logging output above."
			);
}

/**
 * Walk an error's cause chain (including through error events) for a
 * {@link RemoteSessionAuthenticationError}, mirroring the original Wrangler
 * `findRemoteSessionAuthError` walk. Only this specific user error is surfaced
 * verbatim from the chain — generic API errors (which also extend
 * {@link UserError} via {@link APIError}) fall through to the wrapping logic.
 */
function findRemoteSessionAuthError(
	error: unknown
): RemoteSessionAuthenticationError | undefined {
	if (error instanceof RemoteSessionAuthenticationError) {
		return error;
	}
	if (isErrorEvent(error)) {
		return findRemoteSessionAuthError(error.cause);
	}
	if (error instanceof Error) {
		return findRemoteSessionAuthError(error.cause);
	}
	return undefined;
}

export async function startRemoteProxySession(
	bindings: StartDevWorkerInput["bindings"],
	options: StartRemoteProxySessionOptions
): Promise<RemoteProxySession> {
	for (const [name, binding] of Object.entries(bindings ?? {})) {
		if (binding.type === "flagship" && binding.app_id === undefined) {
			throw new UserError(
				`Flagship binding "${name}" has no \`app_id\` and has not been created, but needs to run remotely. Run \`wrangler flagship apps create\` to create an app.`,
				{ telemetryMessage: "flagship remote binding missing app_id" }
			);
		}
	}

	options.logger.log(chalk.dim("⎔ Establishing remote connection..."));
	initLogger(getInternalLogger(options.logger));
	const rawBindings = toRawBindings(bindings);
	const workerConfig = {
		name: options.workerName ?? randomUUID(),
		cliDisplayName: options.cliDisplayName,
		entrypointSource: remoteBindingsWorkerSource,
		compatibilityDate: "2025-04-28",
		compatibilityFlags: [],
		complianceRegion: options.complianceRegion,
		bindings: rawBindings,
		auth: getRemoteBindingsAuthHook(
			options.auth,
			undefined,
			undefined,
			options.logger
		),
		server: { port: 0, secure: false },
	};

	let devEnv: DevEnv | undefined;
	try {
		devEnv = new DevEnv(workerConfig);
		devEnv.start();
	} catch (startWorkerError: unknown) {
		await devEnv?.teardown();
		if (startWorkerError instanceof UserError) {
			throw startWorkerError;
		}
		let errorMessage = startWorkerError;
		if (startWorkerError instanceof Error) {
			errorMessage =
				startWorkerError.cause instanceof Error
					? startWorkerError.cause.message
					: startWorkerError.message;
		}
		throw new Error(
			`Failed to start the remote proxy session, see the error details below:\n\n${errorMessage}`
		);
	}

	const maybeErrorPromise = new DeferredPromise<{ error: unknown }>();
	const onStartupError = (error: unknown) => {
		maybeErrorPromise.resolve({ error });
	};
	devEnv.addListener("error", onStartupError);
	let remoteProxyConnectionString: RemoteProxyConnectionString;
	try {
		const maybeError = await Promise.race([
			maybeErrorPromise,
			devEnv.proxy.localServerReady.promise,
		]);

		if (maybeError && maybeError.error) {
			throw toStartupError(maybeError.error);
		}

		// The local server is ready once the remote Worker has reloaded, but the
		// `play` message that hands the ProxyWorker that remote session is sent in
		// the background. Wait for it: until it lands, every binding request waits
		// in the ProxyWorker's queue, so a session whose `play` never arrives would
		// hang its callers with no error.
		const delivery = await Promise.race([
			maybeErrorPromise,
			devEnv.proxy.latestReloadCompleteMessage,
		]);
		if (delivery === false) {
			throw createPlayNotDeliveredError(devEnv.proxy.latestSendError);
		}
		if (delivery !== true) {
			// DevEnv only logs a failed `play` send and never re-emits it, so an
			// error event here is a separate startup failure (authentication, the
			// remote preview, ...). Report it as itself, even under Bun.
			throw toStartupError(delivery.error);
		}

		remoteProxyConnectionString = (await devEnv.proxy.ready.promise)
			.url as RemoteProxyConnectionString;
	} catch (error) {
		await devEnv.teardown();
		throw error;
	} finally {
		devEnv.removeListener("error", onStartupError);
	}
	const updateBindings = async (
		newBindings: StartDevWorkerInput["bindings"]
	) => {
		const reloadComplete = events.once(devEnv, "reloadComplete");
		devEnv.update({
			...workerConfig,
			bindings: toRawBindings(newBindings),
		});
		try {
			await reloadComplete;
		} catch (errorOrEvent) {
			throw errorOrEvent instanceof Error
				? errorOrEvent
				: new Error(
						`RemoteProxySession.updateBindings failed during reload: ${
							(errorOrEvent as { reason?: string })?.reason ?? "unknown"
						}`,
						{ cause: errorOrEvent }
					);
		}
		// `reloadComplete` fires just after ProxyController starts sending the
		// new `play`, so this is that message's delivery, as at startup.
		if (!(await devEnv.proxy.latestReloadCompleteMessage)) {
			throw createPlayNotDeliveredError(devEnv.proxy.latestSendError);
		}
		await devEnv.proxy.runtimeMessageMutex.drained();
	};

	return {
		ready: Promise.resolve(),
		remoteProxyConnectionString,
		updateBindings,
		dispose: () => devEnv.teardown(),
	};
}

export type RemoteProxySession = {
	ready: Promise<void>;
	dispose(): Promise<void>;
	updateBindings: (bindings: StartDevWorkerInput["bindings"]) => Promise<void>;
	remoteProxyConnectionString: RemoteProxyConnectionString;
};

function toRawBindings(bindings: StartDevWorkerInput["bindings"]) {
	return Object.fromEntries(
		Object.entries(bindings ?? {}).map(([key, binding]) => [
			key,
			{ ...binding, raw: true },
		])
	);
}

function getInternalLogger(logger: RemoteBindingsLogger): RemoteBindingsLogger {
	if (logger.loggerLevel === "debug") {
		return logger;
	}

	const disabled = () => {};
	const loggerLevel = logger.loggerLevel === "none" ? "none" : "error";
	return {
		loggerLevel,
		debug: disabled,
		log: disabled,
		info: disabled,
		warn: disabled,
		error: loggerLevel === "none" ? disabled : logger.error.bind(logger),
		console: disabled,
	};
}
