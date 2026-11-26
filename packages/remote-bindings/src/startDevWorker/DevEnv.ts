import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { UserError } from "@cloudflare/workers-utils";
import { MiniflareCoreError } from "miniflare";
import { logger } from "../logger";
import { castErrorCause } from "./events";
import { ProxyController } from "./ProxyController";
import { RemoteRuntimeController } from "./RemoteRuntimeController";
import type { ErrorEvent, ReloadCompleteEvent } from "./events";
import type { Bundle, StartDevWorkerOptions } from "./types";

export class DevEnv extends EventEmitter {
	runtime: RemoteRuntimeController;
	proxy: ProxyController;
	#bundle: Bundle;
	#config: StartDevWorkerOptions;

	start() {
		this.proxy.start(this.#config);
		this.update(this.#config);
		if (this.#config.lazy) {
			this.proxy.localServerReady.resolve();
		}
	}

	update(config: StartDevWorkerOptions) {
		this.#config = config;
		this.proxy.pause(config);
		this.runtime.onUpdateStart();
		if (!config.lazy) {
			this.connect();
		}
	}

	private connect() {
		this.runtime.onBundleComplete({
			type: "bundleComplete",
			config: this.#config,
			bundle: {
				...this.#bundle,
				// Ensure binding-only updates cannot reuse the previous edge-preview artifact.
				entrypointSource: `${this.#bundle.entrypointSource}\n// remote-bindings-update:${randomUUID()}`,
			},
		});
	}

	constructor(config: StartDevWorkerOptions) {
		super();

		this.#config = config;
		this.#bundle = {
			path: "proxy-worker.js",
			entrypointSource: config.entrypointSource,
			type: "esm",
			modules: [],
		};
		this.proxy = new ProxyController(
			(event) => this.handleErrorEvent(event),
			() => this.runtime.onPreviewTokenExpired(),
			() => {
				if (this.#config.lazy) {
					this.connect();
				}
			}
		);
		this.runtime = new RemoteRuntimeController(
			(event) => this.handleErrorEvent(event),
			(event) => void this.handleReloadComplete(event)
		);

		this.on("error", (event: ErrorEvent) => {
			logger.debug(`Error in ${event.source}: ${event.reason}\n`, event.cause);
			logger.debug("=> Error contextual data:", event.data);
		});
	}

	private async handleReloadComplete(event: ReloadCompleteEvent) {
		let delivered: boolean;
		try {
			delivered = await this.proxy.play(event);
		} catch (error) {
			this.handleErrorEvent({
				type: "error",
				source: "ProxyController",
				reason: "Failed to install the preview connection in ProxyWorker",
				cause: castErrorCause(error),
				data: { config: event.config, bundle: event.bundle },
			});
			return;
		}
		if (delivered) {
			this.emit("reloadComplete", event);
		}
	}

	private handleErrorEvent(event: ErrorEvent): void {
		if (this.#config.lazy && event.source === "RemoteRuntimeController") {
			this.proxy.connectionFailed(event.cause.message);
		}
		if (
			event.cause instanceof MiniflareCoreError &&
			event.cause.isUserError()
		) {
			this.emit(
				"error",
				new UserError(event.cause.message, {
					telemetryMessage: "api dev miniflare user error",
				})
			);
		} else if (
			event.source === "ProxyController" &&
			event.reason.startsWith("Failed to send message to")
		) {
			logger.debug(`Error in ${event.source}: ${event.reason}\n`, event.cause);
			logger.debug("=> Error contextual data:", event.data);
		}
		// if other knowable + recoverable errors occur, handle them here
		else {
			// otherwise, re-emit the unknowable errors to the top-level
			this.emit("error", event);
		}
	}

	async teardown() {
		logger.debug("DevEnv teardown beginning...");

		await Promise.all([this.runtime.teardown(), this.proxy.teardown()]);

		logger.debug("DevEnv teardown complete");
	}
}
