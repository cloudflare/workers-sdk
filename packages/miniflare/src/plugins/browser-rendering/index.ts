import assert from "node:assert";
import { z } from "zod";
import {
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
} from "../shared";

const BrowserRenderingSchema = z.object({
	binding: z.string(),
	remoteProxyConnectionString: z.custom<RemoteProxyConnectionString>(),
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

		assert(
			options.browserRendering.remoteProxyConnectionString,
			"Workers Browser Rendering only supports running remotely"
		);

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

		assert(
			options.browserRendering.remoteProxyConnectionString,
			"Workers Browser Rendering only supports running remotely"
		);

		return [
			{
				name: `${BROWSER_RENDERING_PLUGIN_NAME}:${options.browserRendering.binding}`,
				worker: remoteProxyClientWorker(
					options.browserRendering.remoteProxyConnectionString,
					options.browserRendering.binding
				),
			},
		];
	},
};
