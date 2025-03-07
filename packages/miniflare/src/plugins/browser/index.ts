import WRAPPED_BINDING_WORKER from "worker:browser/binding";
import { z } from "zod";
import { Worker_Binding } from "../../runtime";
import {
	Plugin,
	ProxyNodeBinding,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import { BROWSER_PLUGIN_NAME } from "./constants";

const BrowserOptionsSchema = z.object({
	browser: z.string().optional(),
});

export const BROWSER_PLUGIN: Plugin<typeof BrowserOptionsSchema> = {
	options: BrowserOptionsSchema,
	async getBindings(options, workerIndex) {
		if (options.browser) {
			return [
				{
					name: options.browser,
					wrapped: {
						moduleName: `browser:${workerIndex}`,
						innerBindings: [WORKER_BINDING_SERVICE_LOOPBACK],
					},
				},
			] as Worker_Binding[];
		}
	},

	async getNodeBindings(options) {
		if (options.browser) {
			return { [options.browser]: new ProxyNodeBinding() };
		}
		return {};
	},

	getServices({ options, workerIndex }) {
		if (options.browser) {
			return {
				services: [],
				extensions: [
					{
						modules: [
							{
								name: `browser:${workerIndex}`,
								esModule: WRAPPED_BINDING_WORKER(),
								internal: true,
							},
						],
					},
				],
			};
		}
	},
};

export { BROWSER_PLUGIN_NAME };
