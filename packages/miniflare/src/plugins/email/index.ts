import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import EMAIL_MESSAGE from "worker:email/email";
import SEND_EMAIL_BINDING from "worker:email/send_email";
import { z } from "zod";
import { CoreBindings, sanitisePath } from "../../workers";
import { EMAIL_STORE_SERVICE_NAME } from "../core/constants";
import {
	buildRemoteProxyProps,
	getUserBindingServiceName,
	remoteProxyClientWorker,
	ProxyNodeBinding,
	WORKER_BINDING_SERVICE_LOOPBACK,
} from "../shared";
import type { Service, Worker_Binding } from "../../runtime";
import type { EmailArtifact } from "../../workers/email/storage";
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

export const EmailSharedOptionsSchema = z.object({
	// Mirrors the core shared option. When the local explorer is enabled, the
	// email store service exists, so the send_email worker binds to it to capture
	// sent emails.
	unsafeLocalExplorer: z.boolean().optional(),
});

export const EMAIL_PLUGIN_NAME = "email";
const SERVICE_SEND_EMAIL_WORKER_PREFIX = `SEND-EMAIL-WORKER`;
const EMAIL_REMOTE_SERVICE_NAME = `${EMAIL_PLUGIN_NAME}:remote`;

function buildJsonBindings(bindings: Record<string, any>): Worker_Binding[] {
	return Object.entries(bindings).map(([name, value]) => ({
		name,
		json: JSON.stringify(value),
	}));
}

function getEmailProjectParentDirectory(
	resourceTmpPath: string | undefined
): string | undefined {
	if (resourceTmpPath === undefined) {
		return undefined;
	}
	return path.join(resourceTmpPath, EMAIL_PLUGIN_NAME);
}

/**
 * Returns the session directory for email files.
 * Path: `<resourceTmpPath>/email/<session-id>`
 * Example: `/path/to/project/.wrangler/tmp/email/dev-abc123`
 * When an email is logged, it is stored under this directory using a type indicator
 * and a unique ID.
 * Path: `<session-dir>/<email-type>/<message-id>.<ext>`
 */
function getEmailProjectSessionDirectory(
	resourceTmpPath: string | undefined,
	tmpPath: string
): string | undefined {
	const parentDir = getEmailProjectParentDirectory(resourceTmpPath);
	if (parentDir === undefined) {
		return undefined;
	}
	return path.join(parentDir, path.basename(tmpPath));
}

function resolveContainedPath(directory: string, fileName: string): string {
	const root = path.resolve(directory);
	const resolved = path.resolve(root, fileName);
	if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
		throw new Error("Invalid email temporary-file path");
	}
	return resolved;
}

/**
 * Resolves the directories email files are written to for a given `prefix`
 * (e.g. `"email"`).
 */
export function getEmailFileDirectories(
	resourceTmpPath: string | undefined,
	tmpPath: string,
	prefix: string
): { system: string; project: string | undefined } {
	const projectSessionDir = getEmailProjectSessionDirectory(
		resourceTmpPath,
		tmpPath
	);
	return {
		system: path.join(tmpPath, EMAIL_PLUGIN_NAME, prefix),
		project:
			projectSessionDir !== undefined
				? path.join(projectSessionDir, prefix)
				: undefined,
	};
}

/**
 * Writes email content to the directories resolved by
 * {@link getEmailFileDirectories}.
 *
 * The file is always written to the instance temp directory, and mirrored into
 * the project directory when one is configured so that captured messages
 * outlive the dev session. Returns the path callers should surface, preferring
 * the project copy since that is the one a user can navigate to.
 */
export async function writeEmailTempFile(options: {
	defaultProjectTmpPath: string | undefined;
	tmpPath: string;
	prefix: string;
	fileName: string;
	contents: Buffer;
}): Promise<string> {
	if (
		options.prefix.length === 0 ||
		options.prefix === "." ||
		options.prefix === ".." ||
		options.prefix.includes("/") ||
		options.prefix.includes("\\")
	) {
		throw new Error("Invalid email temporary-file prefix");
	}
	const { system, project } = getEmailFileDirectories(
		options.defaultProjectTmpPath,
		options.tmpPath,
		options.prefix
	);

	await mkdir(system, { recursive: true });
	const systemPath = resolveContainedPath(system, options.fileName);
	await writeFile(systemPath, options.contents);

	if (project === undefined) {
		return systemPath;
	}

	await mkdir(project, { recursive: true });
	const projectPath = resolveContainedPath(project, options.fileName);
	await writeFile(projectPath, options.contents);
	return projectPath;
}

export async function removeEmailTempFiles(options: {
	defaultProjectTmpPath: string | undefined;
	tmpPath: string;
	artifacts: EmailArtifact[];
}): Promise<void> {
	await Promise.all(
		options.artifacts.map(async (artifact) => {
			const { system, project } = getEmailFileDirectories(
				options.defaultProjectTmpPath,
				options.tmpPath,
				artifact.prefix
			);
			const fileName = `${sanitisePath(artifact.id)}.${artifact.extension}`;
			const paths = [
				resolveContainedPath(system, fileName),
				...(project === undefined
					? []
					: [resolveContainedPath(project, fileName)]),
			];
			await Promise.all(
				paths.map((filePath) => unlink(filePath).catch(() => {}))
			);
		})
	);
}

export function getEmailPathsToClean(
	resourceTmpPath: string | undefined,
	tmpPath: string
): { sessionDir: string; parentDir: string } | undefined {
	if (resourceTmpPath === undefined) {
		return undefined;
	}
	const sessionDir = getEmailProjectSessionDirectory(resourceTmpPath, tmpPath);
	const parentDir = getEmailProjectParentDirectory(resourceTmpPath);
	if (sessionDir === undefined || parentDir === undefined) {
		return undefined;
	}
	return { sessionDir, parentDir };
}

export const EMAIL_PLUGIN: Plugin<
	typeof EmailOptionsSchema,
	typeof EmailSharedOptionsSchema
> = {
	options: EmailOptionsSchema,
	sharedOptions: EmailSharedOptionsSchema,
	bindingTypeDescription: "Email",
	getBindings(options): Worker_Binding[] {
		if (!options.email?.send_email) {
			return [];
		}

		const sendEmailBindings = options.email.send_email;

		return sendEmailBindings.map(({ name, remoteProxyConnectionString }) => ({
			name,
			service: remoteProxyConnectionString
				? {
						name: EMAIL_REMOTE_SERVICE_NAME,
						props: buildRemoteProxyProps(remoteProxyConnectionString, name),
					}
				: {
						entrypoint: "SendEmailBinding",
						name: getUserBindingServiceName(
							SERVICE_SEND_EMAIL_WORKER_PREFIX,
							name
						),
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

		// The email store service only exists when the local explorer is enabled.
		const emailStoreBinding: Worker_Binding[] = args.sharedOptions
			.unsafeLocalExplorer
			? [
					{
						name: CoreBindings.SERVICE_EMAIL_STORE,
						service: { name: EMAIL_STORE_SERVICE_NAME },
					},
				]
			: [];

		const services: Service[] = [];
		let hasRemote = false;
		for (const { name, remoteProxyConnectionString, ...config } of args.options
			.email?.send_email ?? []) {
			if (remoteProxyConnectionString) {
				hasRemote = true;
				continue;
			}
			services.push({
				name: getUserBindingServiceName(SERVICE_SEND_EMAIL_WORKER_PREFIX, name),
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
						...emailStoreBinding,
					],
				},
			});
		}

		if (hasRemote) {
			services.push({
				name: EMAIL_REMOTE_SERVICE_NAME,
				worker: remoteProxyClientWorker(),
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
