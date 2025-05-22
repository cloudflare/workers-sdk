import EMAIL_MESSAGE from "worker:email/email";
import SEND_EMAIL_BINDING from "worker:email/send_email";
import { z } from "zod";
import { Extension, Service, Worker_Binding } from "../../runtime";
import { Plugin, WORKER_BINDING_SERVICE_LOOPBACK } from "../shared";

// Define the mutually exclusive schema
const EmailBindingOptionsSchema = z
	.object({
		name: z.string(),
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

		return sendEmailBindings.map(({ name }) => ({
			name,
			service: {
				entrypoint: "SendEmailBinding",
				name: `${SERVICE_SEND_EMAIL_WORKER_PREFIX}:${name}`,
			},
		}));
	},
	getNodeBindings(_options) {
		return {};
	},
	async getServices(args) {
		const extensions: Extension[] = [];
		const services: Service[] = [];
		// we only want to insert on the first worker as it will be shared between them
		if (args.workerIndex === 0) {
			extensions.push({
				modules: [
					{
						name: "cloudflare-internal:email",
						esModule: EMAIL_MESSAGE(),
						internal: true,
					},
				],
			});
		}

		for (const { name, ...config } of args.options.email?.send_email ?? []) {
			services.push({
				name: `${SERVICE_SEND_EMAIL_WORKER_PREFIX}:${name}`,
				worker: {
					compatibilityDate: "2025-03-17",
					modules: [
						{
							name: "send_email.mjs",
							esModule: SEND_EMAIL_BINDING(),
						},
					],
					bindings: [
						...buildJsonBindings(config),
						WORKER_BINDING_SERVICE_LOOPBACK,
					],
				},
			});
		}

		return {
			services,
			extensions,
		};
	},
};
