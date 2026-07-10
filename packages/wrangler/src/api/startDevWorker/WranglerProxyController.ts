import {
	ProxyController as BaseProxyController,
	type ControllerBus,
	type ProxyControllerContext,
} from "@cloudflare/remote-bindings/internal";
import { LogLevel } from "miniflare";
import { version as packageVersion } from "../../../package.json";
import {
	logConsoleMessage,
	maybeHandleNetworkLoadResource,
} from "../../dev/inspect";
import {
	castLogLevel,
	handleStructuredLogs,
	WranglerLog,
} from "../../dev/miniflare";
import { validateHttpsOptions } from "../../https-options";
import { logger } from "../../logger";
import { getSourceMappedStack } from "../../sourcemap";
import type { LogOptions } from "miniflare";

export class ProxyController extends BaseProxyController {
	constructor(bus: ControllerBus) {
		super(bus, {
			logger,
			packageVersion,
			validateHttpsOptions,
			logConsoleMessage,
			maybeHandleNetworkLoadResource,
			getSourceMappedStack,
			createProxyControllerLogger: (localServerReady: Promise<void>) =>
				new ProxyControllerLogger(
					castLogLevel(logger.loggerLevel),
					{
						prefix:
							logger.loggerLevel === "debug"
								? "wrangler-ProxyWorker"
								: "wrangler",
					},
					localServerReady
				),
			handleStructuredLogs,
		} satisfies ProxyControllerContext);
	}
}

class ProxyControllerLogger extends WranglerLog {
	constructor(
		level: LogLevel,
		opts: LogOptions,
		private localServerReady: Promise<void>
	) {
		super(level, opts);
	}

	logReady(message: string): void {
		this.localServerReady.then(() => super.logReady(message)).catch(() => {});
	}

	log(message: string) {
		// Filter out requests handled by the proxy unless debug logging is enabled.
		if (message.includes("/cdn-cgi/") && this.level < LogLevel.DEBUG) {
			return;
		}
		super.log(message);
	}
}
