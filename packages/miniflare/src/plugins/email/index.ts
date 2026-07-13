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
// Disk service name and binding name for writing temporary files to system temp directory
const EMAIL_DISK_SERVICE_NAME = `${EMAIL_PLUGIN_NAME}:disk`;
const EMAIL_DISK_BINDING_NAME = "MINIFLARE_EMAIL_DISK";

function buildJsonBindings(bindings: Record<string, any>): Worker_Binding[] {
	return Object.entries(bindings).map(([name, value]) => ({
		name,
		json: JSON.stringify(value),
	}));
}

function getEmailProjectParentDirectory(
	defaultProjectTmpPath: string | undefined,
	tmpPath: string
): string | undefined {
	if (defaultProjectTmpPath === undefined) {
		return undefined;
	}
	return path.join(
		defaultProjectTmpPath ?? path.join(tmpPath, "tmp"),
		EMAIL_PLUGIN_NAME
	);
}

/**
 * Returns the session directory for email files.
 * Path: `<defaultProjectTmpPath>/email/<session-id>`
 * Example: `/path/to/project/.wrangler/tmp/email/dev-abc123`
 * When an email is logged, it is stored under this directory using a type indicator
 * and a unique ID.
 * Path: `<session-dir>/<email-type>/<message-id>.<ext>`
 */
function getEmailProjectSessionDirectory(
	defaultProjectTmpPath: string | undefined,
	tmpPath: string
): string {
	return path.join(
		getEmailProjectParentDirectory(defaultProjectTmpPath, tmpPath)!,
		path.basename(tmpPath)
	);
}

export function getEmailPathsToClean(
	defaultProjectTmpPath: string | undefined,
	tmpPath: string
): { sessionDir: string; parentDir: string } | undefined {
	if (defaultProjectTmpPath === undefined) {
		return undefined;
	}
	const sessionDir = getEmailProjectSessionDirectory(
		defaultProjectTmpPath,
		tmpPath
	);
	const parentDir = getEmailProjectParentDirectory(
		defaultProjectTmpPath,
		tmpPath
	);
	if (!parentDir) {
		return undefined;
	}
	return { sessionDir, parentDir };
}

export const EMAIL_PLUGIN: Plugin<typeof EmailOptionsSchema> = {
	options: EmailOptionsSchema,
	bindingTypeDescription: "Email",
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

		// Root directories for disk services - must exist before service creation
		// Subdirectories (e.g., email-text/, email-html/) are created lazily on first write
		const emailSystemDirectory = path.join(args.tmpPath, EMAIL_PLUGIN_NAME);
		await mkdir(emailSystemDirectory, { recursive: true });

		// Map binding disk services to names and paths, for concise access when storing emails as files.
		// When defaultProjectTmpPath is unset, only create system service to avoid duplicates
		const diskServices: Array<{
			location: "system" | "project";
			bindingName: string;
			serviceName: string;
			path: string;
		}> = [
			{
				location: "system",
				bindingName: `${EMAIL_DISK_BINDING_NAME}_SYSTEM`,
				serviceName: `${EMAIL_DISK_SERVICE_NAME}:system`,
				path: emailSystemDirectory,
			},
		];

		if (args.defaultProjectTmpPath) {
			const emailProjectSessionDirectory = getEmailProjectSessionDirectory(
				args.defaultProjectTmpPath,
				args.tmpPath
			);
			await mkdir(emailProjectSessionDirectory, { recursive: true });
			diskServices.push({
				location: "project",
				bindingName: `${EMAIL_DISK_BINDING_NAME}_PROJECT`,
				serviceName: `${EMAIL_DISK_SERVICE_NAME}:project`,
				path: emailProjectSessionDirectory,
			});
		}

		const services: Service[] = diskServices.map(({ serviceName, path }) => ({
			name: serviceName,
			disk: {
				path,
				writable: true,
			},
		}));

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
								...diskServices.map(({ bindingName, serviceName }) => ({
									name: bindingName,
									service: { name: serviceName },
								})),
								{
									name: "email_disk_services",
									json: JSON.stringify(diskServices),
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
