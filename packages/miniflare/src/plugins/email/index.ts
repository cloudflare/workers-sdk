import { mkdir } from "node:fs/promises";
import path from "node:path";
import EMAIL_MESSAGE from "worker:email/email";
import SEND_EMAIL_BINDING from "worker:email/send_email";
import { z } from "zod";
import {
	getUserBindingServiceName,
	remoteProxyClientWorker,
	ProxyNodeBinding,
} from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type { Plugin, RemoteProxyConnectionString } from "../shared";

// Define the mutually exclusive schema
const EmailBindingOptionsSchema = z
	.object({
		name: z.string(),
		remoteProxyConnectionString: z
			.custom<RemoteProxyConnectionString>()
			.optional(),
		allowed_sender_addresses: z.array(z.string()).optional(),
	})
	.and(
		z.union([
			z.object({
				destination_address: z.string().optional(),
				allowed_destination_addresses: z.never().optional(),
			}),
			z.object({
				allowed_destination_addresses: z.array(z.string()).optional(),
				destination_address: z.never().optional(),
			}),
		])
	);

export const EmailOptionsSchema = z.object({
	email: z
		.object({
			send_email: z.array(EmailBindingOptionsSchema).optional(),
		})
		.optional(),
});

export const EMAIL_PLUGIN_NAME = "email";
const SERVICE_SEND_EMAIL_WORKER_PREFIX = `SEND-EMAIL-WORKER`;
const EMAIL_DISK_SERVICE_NAME = `${EMAIL_PLUGIN_NAME}:disk`;
const EMAIL_DISK_BINDING_NAME = "MINIFLARE_EMAIL_DISK";

function buildJsonBindings(bindings: Record<string, any>): Worker_Binding[] {
	return Object.entries(bindings).map(([name, value]) => ({
		name,
		json: JSON.stringify(value),
	}));
}

export const EMAIL_PLUGIN: Plugin<typeof EmailOptionsSchema> = {
	options: EmailOptionsSchema,
	getBindings(options): Worker_Binding[] {
		if (!options.email?.send_email) {
			return [];
		}

		const sendEmailBindings = options.email.send_email;

		return sendEmailBindings.map(({ name, remoteProxyConnectionString }) => ({
			name,
			service: {
				entrypoint: remoteProxyConnectionString
					? undefined
					: "SendEmailBinding",
				name: getUserBindingServiceName(SERVICE_SEND_EMAIL_WORKER_PREFIX, name),
			},
		}));
	},
	getNodeBindings(options) {
		if (!options.email?.send_email) {
			return {};
		}

		return Object.fromEntries(
			options.email.send_email.map(({ name }) => [name, new ProxyNodeBinding()])
		);
	},
	async getServices(args) {
		if (!args.options.email?.send_email) {
			return [];
		}

		const emailDirectory = path
			.join(args.tmpPath, EMAIL_PLUGIN_NAME)
			.replaceAll("\\", "/");
		await mkdir(emailDirectory, { recursive: true });

		const services: Service[] = [
			{
				name: EMAIL_DISK_SERVICE_NAME,
				disk: {
					path: emailDirectory,
					writable: true,
				},
			},
		];

		for (const { name, remoteProxyConnectionString, ...config } of args.options
			.email?.send_email ?? []) {
			services.push({
				name: getUserBindingServiceName(SERVICE_SEND_EMAIL_WORKER_PREFIX, name),
				worker: remoteProxyConnectionString
					? remoteProxyClientWorker(remoteProxyConnectionString, name)
					: {
							compatibilityDate: "2025-03-17",
							modules: [
								{
									name: "send_email.mjs",
									esModule: SEND_EMAIL_BINDING(),
								},
							],
							bindings: [
								...buildJsonBindings(config),
								{
									name: EMAIL_DISK_BINDING_NAME,
									service: { name: EMAIL_DISK_SERVICE_NAME },
								},
								{
									name: "email_directory",
									json: JSON.stringify(emailDirectory),
								},
							],
						},
			});
		}

		return services;
	},

	getExtensions() {
		return [
			{
				modules: [
					{
						name: "cloudflare-internal:email",
						esModule: EMAIL_MESSAGE(),
						internal: true,
					},
				],
			},
		];
	},
};
