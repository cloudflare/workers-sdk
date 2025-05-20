import BROWSER_RENDERING_WORKER from "worker:browser-rendering/binding";
import { z } from "zod";
import {
	mixedModeClientWorker,
	MixedModeConnectionString,
	Plugin,
	ProxyNodeBinding,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";

const BrowserRenderingSchema = z.object({
	binding: z.string(),
	mixedModeConnectionString: z.custom<MixedModeConnectionString>(),
});

export const BrowserRenderingOptionsSchema = z.object({
	browserRendering: BrowserRenderingSchema.optional(),
});

export const BROWSER_RENDERING_PLUGIN_NAME = "browser-rendering";

export const BROWSER_RENDERING_PLUGIN: Plugin<
	typeof BrowserRenderingOptionsSchema
> = {
	options: BrowserRenderingOptionsSchema,
	async getBindings(options, workerIndex) {
		if (!options.browserRendering) {
			return [];
		}

		return options.browserRendering.mixedModeConnectionString
			? [
					{
						name: options.browserRendering.binding,
						service: {
							name: `${BROWSER_RENDERING_PLUGIN_NAME}:${options.browserRendering.binding}`,
						},
					},
				]
			: [
					{
						name: options.browserRendering.binding,
						wrapped: {
							moduleName: `browser:${workerIndex}`,
							innerBindings: [WORKER_BINDING_SERVICE_LOOPBACK],
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
	async getServices({ options, workerIndex }) {
		if (!options.browserRendering) {
			return [];
		}

		return options.browserRendering.mixedModeConnectionString
			? [
					{
						name: `${BROWSER_RENDERING_PLUGIN_NAME}:${options.browserRendering.binding}`,
						worker: mixedModeClientWorker(
							options.browserRendering.mixedModeConnectionString,
							options.browserRendering.binding
						),
					},
				]
			: {
					services: [],
					extensions: [
						{
							modules: [
								{
									name: `browser:${workerIndex}`,
									esModule: BROWSER_RENDERING_WORKER(),
									internal: true,
								},
							],
						},
					],
				};
	},
};
