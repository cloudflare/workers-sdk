import { fork } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import {
	pickRemoteBindings,
	shouldStartRemoteProxySessionLazily,
	startRemoteProxySession,
} from "@cloudflare/remote-bindings";
import {
	getCloudflareComplianceRegion,
	UserError,
} from "@cloudflare/workers-utils";
import { logger } from "../../../logger";
import { getBasePath } from "../../../paths";
import { isCfAuthActive } from "../../../user";
import { getDefaultRemoteBindingsAuth } from "../../remoteBindings/auth";
import { convertConfigBindingsToStartWorkerBindings } from "../../startDevWorker/binding-utils";
import type {
	RemoteProxySession,
	StartRemoteProxySessionOptions,
} from "@cloudflare/remote-bindings";
import type { Binding } from "@cloudflare/workers-utils";
import type { Config } from "@cloudflare/workers-utils/config";

export const PLATFORM_PROXY_REMOTE_SESSION_ARG =
	"--internal-platform-proxy-remote-session";

type PlatformProxyRemoteSession = Pick<
	RemoteProxySession,
	"remoteProxyConnectionString" | "dispose"
>;

type SessionConfig = Pick<
	StartRemoteProxySessionOptions,
	"workerName" | "complianceRegion" | "cliDisplayName"
> & {
	bindings: Record<string, Binding>;
	accountId?: string;
};

type StartupMessage =
	| { type: "ready"; url: string }
	| {
			type: "error";
			message: string;
			stack?: string;
			userError: boolean;
			telemetryMessage?: string;
	  };

export async function startPlatformProxyRemoteSession(
	config: Config
): Promise<PlatformProxyRemoteSession | undefined> {
	const bindings = pickRemoteBindings(
		convertConfigBindingsToStartWorkerBindings(config) ?? {}
	);
	if (Object.keys(bindings).length === 0) {
		return;
	}

	const sessionConfig: SessionConfig = {
		bindings,
		workerName: config.name ?? "worker",
		accountId: config.account_id,
		complianceRegion: getCloudflareComplianceRegion(config),
		cliDisplayName: isCfAuthActive() ? "cf" : "Wrangler",
	};
	const lazy = shouldStartRemoteProxySessionLazily(bindings);
	if (!lazy || process.versions.bun) {
		return startSession(sessionConfig, lazy);
	}
	return startBackgroundSession(sessionConfig);
}

function startSession(
	{ bindings, accountId, ...options }: SessionConfig,
	lazy: boolean
) {
	return startRemoteProxySession(bindings, {
		...options,
		lazy,
		auth: getDefaultRemoteBindingsAuth(accountId).hook,
		logger,
	});
}

/** Keep the whole lazy session independent of synchronous binding calls, including terminal I/O for OAuth. */
async function startBackgroundSession(
	config: SessionConfig
): Promise<PlatformProxyRemoteSession> {
	const child = fork(
		path.join(getBasePath(), "wrangler-dist", "cli.js"),
		[PLATFORM_PROXY_REMOTE_SESSION_ARG],
		{
			execArgv: [],
			env: { ...process.env, WRANGLER_LOG: logger.loggerLevel },
			stdio: ["inherit", "inherit", "inherit", "ipc"],
		}
	);
	const startup = Promise.withResolvers<StartupMessage>();
	const exited = new Promise<void>((resolve) => {
		child.once("exit", (code, signal) => {
			startup.reject(
				new Error(
					`The getPlatformProxy remote session exited before it was ready (${signal ?? code}).`
				)
			);
			resolve();
		});
		child.on("error", (error) => {
			startup.reject(error);
			if (child.pid === undefined) {
				resolve();
			}
		});
	});
	child.once("message", startup.resolve);
	const dispose = async () => {
		if (child.connected) {
			child.disconnect();
		}
		await exited;
	};
	try {
		child.send(config, (error) => {
			if (error) {
				startup.reject(error);
			}
		});
		const message = await startup.promise;
		if (message.type === "error") {
			const error = message.userError
				? new UserError(message.message, {
						telemetryMessage: message.telemetryMessage ?? false,
					})
				: new Error(message.message);
			error.stack = message.stack;
			throw error;
		}
		return {
			remoteProxyConnectionString: new URL(
				message.url
			) as RemoteProxySession["remoteProxyConnectionString"],
			dispose,
		};
	} catch (error) {
		await dispose();
		throw error;
	}
}

async function sendStartupMessage(message: StartupMessage) {
	const send = process.send?.bind(process);
	if (send && process.connected) {
		await new Promise<void>((resolve, reject) => {
			send(message, (error: Error | null) =>
				error ? reject(error) : resolve()
			);
		});
	}
}

export async function runPlatformProxyRemoteSession(): Promise<void> {
	const disconnected = once(process, "disconnect").then(() => undefined);
	const config: SessionConfig | undefined = await Promise.race([
		once(process, "message").then(([message]) => message),
		disconnected,
	]);
	if (!config || !process.connected) {
		return;
	}

	let session: RemoteProxySession | undefined;
	try {
		try {
			session = await startSession(config, true);
		} catch (error) {
			await sendStartupMessage({
				type: "error",
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				userError: error instanceof UserError,
				telemetryMessage:
					error instanceof UserError ? error.telemetryMessage : undefined,
			});
			return;
		}
		await sendStartupMessage({
			type: "ready",
			url: session.remoteProxyConnectionString.href,
		});
		await disconnected;
	} finally {
		if (process.connected) {
			process.disconnect?.();
		}
		await session?.dispose();
	}
}
