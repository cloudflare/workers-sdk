import * as z from "zod/v4";
import {
	getUserBindingServiceName,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
} from "../shared";

const MtlsSchema = z.object({
	certificate_id: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const MtlsOptionsSchema = z.object({
	mtlsCertificates: z.record(z.string(), MtlsSchema).optional(),
});

export const MTLS_PLUGIN_NAME = "mtls";

export const MTLS_PLUGIN: Plugin<typeof MtlsOptionsSchema> = {
	options: MtlsOptionsSchema,
	async getBindings(options) {
		if (!options.mtlsCertificates) {
			return [];
		}

		return Object.entries(options.mtlsCertificates).map(
			([name, { certificate_id, remoteProxyConnectionString }]) => {
				return {
					name,

					service: {
						name: getUserBindingServiceName(
							MTLS_PLUGIN_NAME,
							certificate_id,
							remoteProxyConnectionString
						),
					},
				};
			}
		);
	},
	getNodeBindings(options: z.infer<typeof MtlsOptionsSchema>) {
		if (!options.mtlsCertificates) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.mtlsCertificates).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (!options.mtlsCertificates) {
			return [];
		}

		return Object.entries(options.mtlsCertificates).map(
			([name, { certificate_id, remoteProxyConnectionString }]) => {
				return {
					name: getUserBindingServiceName(
						MTLS_PLUGIN_NAME,
						certificate_id,
						remoteProxyConnectionString
					),
					worker: remoteProxyClientWorker(remoteProxyConnectionString, name),
				};
			}
		);
	},
};
