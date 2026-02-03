import * as z from "zod/v4";
import { CoreBindings, CoreHeaders } from "../../workers";
import {
	getUserBindingServiceName,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";

const IMAGES_LOCAL_FETCHER = /* javascript */ `
	export default {
		fetch(req, env) {
			const request = new Request(req);
			request.headers.set("${CoreHeaders.CUSTOM_FETCH_SERVICE}", "${CoreBindings.IMAGES_SERVICE}");
			request.headers.set("${CoreHeaders.ORIGINAL_URL}", request.url);
			return env.${CoreBindings.SERVICE_LOOPBACK}.fetch(request)
		}
	}
`;

const ImagesSchema = z.object({
	binding: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const ImagesOptionsSchema = z.object({
	images: ImagesSchema.optional(),
});

export const IMAGES_PLUGIN_NAME = "images";

export const IMAGES_PLUGIN: Plugin<typeof ImagesOptionsSchema> = {
	options: ImagesOptionsSchema,
	async getBindings(options) {
		if (!options.images) {
			return [];
		}

		return [
			{
				name: options.images.binding,
				wrapped: {
					moduleName: "cloudflare-internal:images-api",
					innerBindings: [
						{
							name: "fetcher",
							service: {
								name: getUserBindingServiceName(
									IMAGES_PLUGIN_NAME,
									options.images.binding,
									options.images.remoteProxyConnectionString
								),
							},
						},
					],
				},
			},
		];
	},
	getNodeBindings(options: z.infer<typeof ImagesOptionsSchema>) {
		if (!options.images) {
			return {};
		}
		return {
			[options.images.binding]: new ProxyNodeBinding(),
		};
	},
	async getServices({ options }) {
		if (!options.images) {
			return [];
		}

		return [
			{
				name: getUserBindingServiceName(
					IMAGES_PLUGIN_NAME,
					options.images.binding,
					options.images.remoteProxyConnectionString
				),
				worker: options.images.remoteProxyConnectionString
					? remoteProxyClientWorker(
							options.images.remoteProxyConnectionString,
							options.images.binding
						)
					: {
							modules: [
								{
									name: "index.worker.js",
									esModule: IMAGES_LOCAL_FETCHER,
								},
							],
							compatibilityDate: "2025-04-01",
							bindings: [WORKER_BINDING_SERVICE_LOOPBACK],
						},
			},
		];
	},
};
