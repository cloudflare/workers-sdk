import { fork } from "node:child_process";
import path from "node:path";
import {
	pickRemoteBindings,
	shouldStartRemoteProxySessionLazily,
} from "@cloudflare/remote-bindings";
import {
	getCloudflareComplianceRegion,
	UserError,
} from "@cloudflare/workers-utils";
import { logger } from "../../../logger";
import { getBasePath } from "../../../paths";
import { isCfAuthActive } from "../../../user";
import { convertConfigBindingsToStartWorkerBindings } from "../../startDevWorker/binding-utils";
import { startSession } from "./remote-session-shared";
import type { SessionConfig, StartupMessage } from "./remote-session-shared";
import type { RemoteProxySession } from "@cloudflare/remote-bindings";
import type { Config } from "@cloudflare/workers-utils/config";

type PlatformProxyRemoteSession = Pick<
	RemoteProxySession,
	"remoteProxyConnectionString" | "dispose"
>;

/**
 * Start the configured remote bindings, if any. The caller owns disposal.
 * A lazy session inherits the environment at proxy creation, but only resolves
 * credentials on the first binding call.
 */
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

/** Keep the whole lazy session independent of synchronous binding calls, including terminal I/O for OAuth. */
async function startBackgroundSession(
	config: SessionConfig
): Promise<PlatformProxyRemoteSession> {
	const child = fork(
		path.join(
			getBasePath(),
			"wrangler-dist",
			"platform-proxy-remote-session.js"
		),
		{
			execArgv: process.execArgv.filter((arg) =>
				/^--(?:no-)?use-(?:(?:bundled|openssl|system)-ca|env-proxy)(?:=|$)/.test(
					arg.replaceAll("_", "-")
				)
			),
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
