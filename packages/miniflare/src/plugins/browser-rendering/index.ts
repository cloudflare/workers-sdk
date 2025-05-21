import BROWSER_RENDERING_WORKER from "worker:browser-rendering/binding";
import { z } from "zod";
import { kVoid } from "../../runtime";
import {
	mixedModeClientWorker,
	MixedModeConnectionString,
	Plugin,
	ProxyNodeBinding,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";

const BrowserRenderingSchema = z.object({
	binding: z.string(),
	mixedModeConnectionString: z.custom<MixedModeConnectionString>().optional(),
});

export const BrowserRenderingOptionsSchema = z.object({
	browserRendering: BrowserRenderingSchema.optional(),
});

export const BROWSER_RENDERING_PLUGIN_NAME = "browser-rendering";

export const BROWSER_RENDERING_PLUGIN: Plugin<
	typeof BrowserRenderingOptionsSchema
> = {
	options: BrowserRenderingOptionsSchema,
	async getBindings(options) {
		if (!options.browserRendering) {
			return [];
		}

		return [
			{
				name: options.browserRendering.binding,
				service: {
					name: `${BROWSER_RENDERING_PLUGIN_NAME}:${options.browserRendering.binding}`,
				},
			},
		];
	},
	getNodeBindings(options: z.infer<typeof BrowserRenderingOptionsSchema>) {
		if (!options.browserRendering) {
			return {};
		}
		return {
			[options.browserRendering.binding]: new ProxyNodeBinding(),
		};
	},
	async getServices({ options }) {
		if (!options.browserRendering) {
			return [];
		}

		return [
			{
				name: `${BROWSER_RENDERING_PLUGIN_NAME}:${options.browserRendering.binding}`,
				worker: options.browserRendering.mixedModeConnectionString
					? mixedModeClientWorker(
							options.browserRendering.mixedModeConnectionString,
							options.browserRendering.binding
						)
					: {
							compatibilityDate: "2025-05-01",
							modules: [
								{
									name: "index.worker.js",
									esModule: BROWSER_RENDERING_WORKER(),
								},
							],
							bindings: [
								WORKER_BINDING_SERVICE_LOOPBACK,
								{
									name: "BrowserSession",
									durableObjectNamespace: {
										className: "BrowserSession",
									},
								},
							],
							durableObjectNamespaces: [
								{
									className: "BrowserSession",
								},
							],
							durableObjectStorage: { inMemory: kVoid },
						},
			},
		];
	},
};
