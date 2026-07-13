import { initDeployHelpersContext } from "@cloudflare/deploy-helpers/context";
import {
	DevEnv,
	type DevEnvOptions,
	type ErrorEvent,
} from "@cloudflare/remote-bindings/internal";
import { ParseError, UserError } from "@cloudflare/workers-utils";
import { MiniflareCoreError } from "miniflare";
import {
	fetchKVGetValue,
	fetchListResult,
	fetchPagedListResult,
	fetchResult,
} from "../../cfetch";
import {
	isBuildFailure,
	isBuildFailureFromCause,
} from "../../deployment-bundle/build-failures";
import { confirm, prompt, select } from "../../dialogs";
import { logBuildFailure, logger, runWithLogLevel } from "../../logger";
import { BundlerController } from "./BundlerController";
import { ConfigController } from "./ConfigController";
import { LocalRuntimeController } from "./LocalRuntimeController";
import { ProxyController } from "./WranglerProxyController";
import { WranglerRemoteRuntimeController } from "./WranglerRemoteRuntimeController";

const defaultDevEnvOptions: DevEnvOptions = {
	configFactory: (devEnv) => new ConfigController(devEnv),
	bundlerFactory: (devEnv) => new BundlerController(devEnv),
	runtimeFactories: [
		(devEnv) => new LocalRuntimeController(devEnv),
		(devEnv) => new WranglerRemoteRuntimeController(devEnv),
	],
	proxyFactory: (devEnv) => new ProxyController(devEnv),
	context: {
		logger,
		initialize: initializeDeployHelpers,
		handleErrorEvent,
		runWithLogLevel,
	},
};

export class WranglerDevEnv extends DevEnv {
	constructor(options: Partial<DevEnvOptions> = {}) {
		super({ ...defaultDevEnvOptions, ...options });
	}
}

function initializeDeployHelpers(): void {
	initDeployHelpersContext({
		logger,
		fetchResult,
		fetchListResult,
		fetchPagedListResult,
		fetchKVGetValue,
		confirm,
		prompt,
		select,
	});
}

function handleErrorEvent(devEnv: DevEnv, event: ErrorEvent): void {
	if (event.cause instanceof MiniflareCoreError && event.cause.isUserError()) {
		devEnv.emit(
			"error",
			new UserError(event.cause.message, {
				telemetryMessage: "api dev miniflare user error",
			})
		);
	} else if (
		event.source === "ProxyController" &&
		(event.reason.startsWith("Failed to send message to") ||
			event.reason.startsWith("Could not connect to InspectorProxyWorker"))
	) {
		logger.debug(`Error in ${event.source}: ${event.reason}\n`, event.cause);
		logger.debug("=> Error contextual data:", event.data);
	}
	// Parse errors are recoverable by changing your Wrangler configuration file and saving
	// All other errors from the ConfigController are non-recoverable
	else if (
		event.source === "ConfigController" &&
		event.cause instanceof ParseError
	) {
		logger.error(event.cause);
		devEnv.emit("buildFailed", event);
	}
	// Build errors are recoverable by fixing the code and saving
	else if (event.source === "BundlerController") {
		if (isBuildFailure(event.cause)) {
			logBuildFailure(event.cause.errors, event.cause.warnings);
		} else if (isBuildFailureFromCause(event.cause)) {
			logBuildFailure(event.cause.cause.errors, event.cause.cause.warnings);
		} else {
			logger.error(event.cause.message);
		}
		devEnv.emit("buildFailed", event);
	}
	// if other knowable + recoverable errors occur, handle them here
	else {
		// otherwise, re-emit the unknowable errors to the top-level
		devEnv.emit("error", event);
	}
}
