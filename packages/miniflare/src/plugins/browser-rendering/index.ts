import assert from "node:assert";
import SCRIPT_MIXED_MODE_CLIENT from "worker:shared/mixed-mode-client";
import { z } from "zod";
import {
	mixedModeClientWorker,
	MixedModeConnectionString,
	Plugin,
	ProxyNodeBinding,
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
	async getBindings(options) {
		if (!options.browserRendering) {
			return [];
		}

		assert(
			options.browserRendering.mixedModeConnectionString,
			"Workers Browser Rendering only supports Mixed Mode"
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

		return [
			{
				name: `${BROWSER_RENDERING_PLUGIN_NAME}:${options.browserRendering.binding}`,
				worker: mixedModeClientWorker(
					options.browserRendering.mixedModeConnectionString,
					options.browserRendering.binding
				),
			},
		];
	},
};
