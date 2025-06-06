import assert from "node:assert";
import { z } from "zod";
import {
	mixedModeClientWorker,
	MixedModeConnectionString,
	Plugin,
	ProxyNodeBinding,
} from "../shared";

const MtlsSchema = z.object({
	certificate_id: z.string(),
	mixedModeConnectionString: z.custom<MixedModeConnectionString>(),
});

export const MtlsOptionsSchema = z.object({
	mtlsCertificates: z.record(MtlsSchema).optional(),
});

export const MTLS_PLUGIN_NAME = "mtls";

export const MTLS_PLUGIN: Plugin<typeof MtlsOptionsSchema> = {
	options: MtlsOptionsSchema,
	async getBindings(options) {
		if (!options.mtlsCertificates) {
			return [];
		}

		return Object.entries(options.mtlsCertificates).map(
			([name, { certificate_id, mixedModeConnectionString }]) => {
				assert(mixedModeConnectionString, "MTLS only supports Mixed Mode");

				return {
					name,

					service: {
						name: `${MTLS_PLUGIN_NAME}:${certificate_id}`,
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
			([name, { certificate_id, mixedModeConnectionString }]) => {
				assert(mixedModeConnectionString, "MTLS only supports Mixed Mode");

				return {
					name: `${MTLS_PLUGIN_NAME}:${certificate_id}`,
					worker: mixedModeClientWorker(mixedModeConnectionString, name),
				};
			}
		);
	},
};
