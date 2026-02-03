import * as z from "zod/v4";
import {
	getUserBindingServiceName,
	Plugin,
	ProxyNodeBinding,
	remoteProxyClientWorker,
	RemoteProxyConnectionString,
} from "../shared";

const VpcServicesSchema = z.object({
	service_id: z.string(),
	remoteProxyConnectionString: z
		.custom<RemoteProxyConnectionString>()
		.optional(),
});

export const VpcServicesOptionsSchema = z.object({
	vpcServices: z.record(z.string(), VpcServicesSchema).optional(),
});

export const VPC_SERVICES_PLUGIN_NAME = "vpc-services";

export const VPC_SERVICES_PLUGIN: Plugin<typeof VpcServicesOptionsSchema> = {
	options: VpcServicesOptionsSchema,
	async getBindings(options) {
		if (!options.vpcServices) {
			return [];
		}

		return Object.entries(options.vpcServices).map(
			([name, { service_id, remoteProxyConnectionString }]) => {
				return {
					name,

					service: {
						name: getUserBindingServiceName(
							VPC_SERVICES_PLUGIN_NAME,
							service_id,
							remoteProxyConnectionString
						),
					},
				};
			}
		);
	},
	getNodeBindings(options: z.infer<typeof VpcServicesOptionsSchema>) {
		if (!options.vpcServices) {
			return {};
		}
		return Object.fromEntries(
			Object.keys(options.vpcServices).map((name) => [
				name,
				new ProxyNodeBinding(),
			])
		);
	},
	async getServices({ options }) {
		if (!options.vpcServices) {
			return [];
		}

		return Object.entries(options.vpcServices).map(
			([name, { service_id, remoteProxyConnectionString }]) => {
				return {
					name: getUserBindingServiceName(
						VPC_SERVICES_PLUGIN_NAME,
						service_id,
						remoteProxyConnectionString
					),
					worker: remoteProxyClientWorker(remoteProxyConnectionString, name),
				};
			}
		);
	},
};
