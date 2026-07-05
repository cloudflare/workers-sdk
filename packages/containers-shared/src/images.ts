import { UserError } from "@cloudflare/workers-utils";
import { buildImage } from "./build";
import { ExternalRegistryKind } from "./client/models/ExternalRegistryKind";
import { getCloudflareContainerRegistry } from "./knobs";
import { dockerLoginImageRegistry } from "./login";
import { getCloudflareRegistryWithAccountNamespace } from "./registry";
import {
	checkExposedPorts,
	cleanupDuplicateImageTags,
	runDockerCmd,
	verifyDockerInstalled,
} from "./utils";
import type {
	ContainerDevOptions,
	DockerfileConfig,
	ViteLogger,
	WranglerLogger,
} from "./types";

export const DEFAULT_CONTAINER_EGRESS_INTERCEPTOR_IMAGE =
	"cloudflare/proxy-everything:3cb1195@sha256:0ef6716c52430096900b150d84a3302057d6cd2319dae7987128c85d0733e3c8";

export function getEgressInterceptorPlatform(): string | undefined {
	return process.env.MINIFLARE_CONTAINER_EGRESS_IMAGE_PLATFORM;
}

export function getEgressInterceptorImage(): string {
	return (
		process.env.MINIFLARE_CONTAINER_EGRESS_IMAGE ??
		DEFAULT_CONTAINER_EGRESS_INTERCEPTOR_IMAGE
	);
}

export async function pullEgressInterceptorImage(
	dockerPath: string
): Promise<void> {
	const image = getEgressInterceptorImage();
	const platform = getEgressInterceptorPlatform();
	const args = ["pull", image];
	if (platform !== undefined) {
		args.push("--platform", platform);
	}
	await runDockerCmd(dockerPath, args);
}

export async function pullImage(
	dockerPath: string,
	options: Exclude<ContainerDevOptions, DockerfileConfig>,
	logger: WranglerLogger | ViteLogger
): Promise<{ abort: () => void; ready: Promise<void> }> {
	const domain = new URL(`http://${options.image_uri}`).hostname;

	const isExternalRegistry = domain !== getCloudflareContainerRegistry();
	try {
		await dockerLoginImageRegistry(dockerPath, domain);
	} catch (e) {
		if (!isExternalRegistry) {
			throw e;
		}
		logger?.warn(
			"Unable to retrieve configured registry credentials from Cloudflare." +
				"\nUnless this is a public image, you will need to run `wrangler containers registries configure` before deploying." +
				"\nAttempting to pull image anyway..."
		);
	}

	const pull = runDockerCmd(dockerPath, [
		"pull",
		options.image_uri,
		// All containers running on our platform need to be built for amd64 architecture, but by default docker pull seems to look for an image matching the host system, so we need to specify this here
		"--platform",
		"linux/amd64",
	]);
	const ready = pull.ready.then(async ({ aborted }: { aborted: boolean }) => {
		if (!aborted) {
			// re-tag image with the expected dev-formatted image tag for consistency
			await runDockerCmd(dockerPath, [
				"tag",
				options.image_uri,
				options.image_tag,
			]);
		}
	});

	return {
		abort: () => {
			pull.abort();
		},
		ready,
	};
}

/**
 *
 * Builds or pulls the container images for local development. This
 * will be called before starting the local development server, and by a rebuild
 * hotkey during development.
 *
 * Because this runs when local dev starts, we also do some validation here,
 * such as checking if the Docker CLI is installed, and if the container images
 * expose any ports.
 */
export async function prepareContainerImagesForDev(args: {
	dockerPath: string;
	containerOptions: ContainerDevOptions[];
	onContainerImagePreparationStart: (args: {
		containerOptions: ContainerDevOptions;
		abort: () => void;
	}) => void;
	onContainerImagePreparationEnd: (args: {
		containerOptions: ContainerDevOptions;
	}) => void;
	logger: WranglerLogger | ViteLogger;
}): Promise<void> {
	const {
		dockerPath,
		containerOptions,
		onContainerImagePreparationStart,
		onContainerImagePreparationEnd,
	} = args;
	let aborted = false;
	await verifyDockerInstalled({
		dockerPath,
		operation: "running dev",
		imageNoun:
			containerOptions.length !== 1
				? "the configured images"
				: "the configured image",
		hint: "To suppress this error if you do not intend on triggering any container instances, set dev.enable_containers to false in your Wrangler config or pass --enable-containers=false.",
	});
	for (const options of containerOptions) {
		if ("dockerfile" in options) {
			const build = await buildImage(dockerPath, options, false);
			onContainerImagePreparationStart({
				containerOptions: options,
				abort: () => {
					aborted = true;
					build.abort();
				},
			});
			await build.ready;

			onContainerImagePreparationEnd({
				containerOptions: options,
			});
		} else {
			const pull = await pullImage(dockerPath, options, args.logger);
			onContainerImagePreparationStart({
				containerOptions: options,
				abort: () => {
					aborted = true;
					pull.abort();
				},
			});
			await pull.ready;
			onContainerImagePreparationEnd({
				containerOptions: options,
			});
		}
		if (!aborted) {
			// Clean up duplicate image tags. This is scoped to cloudflare-dev only
			await cleanupDuplicateImageTags(dockerPath, options.image_tag);

			await checkExposedPorts(dockerPath, options);
		}
	}

	// Pull the egress interceptor image used to intercept outbound HTTP from
	// containers and route it back to workerd (e.g. for interceptOutboundHttp).
	if (!aborted) {
		await pullEgressInterceptorImage(dockerPath);
	}
}

/**
 * Resolve an image name to the full unambiguous name.
 *
 * image:tag -> prepend registry.cloudflare.com/accountid/
 * registry.cloudflare.com/image:tag -> registry.cloudlfare.com/accountid/image:tag
 * registry.cloudflare.com/accountid/image:tag -> no change
 * anyother-registry.com/anything -> no change
 */
export function resolveImageName(accountId: string, image: string): string {
	let url: URL | undefined;
	try {
		url = new URL(`http://${image}`);
	} catch {
		// Invalid URL
	}

	if (
		url === undefined ||
		(!url.host.match(/[:.]/) && url.hostname !== "localhost")
	) {
		// Not a valid URL so assume it is in the format image:tag and prepend the registry
		return getCloudflareRegistryWithAccountNamespace(accountId, image);
	}

	if (url.hostname !== getCloudflareContainerRegistry()) {
		// hostname not the managed registry, passthrough
		return image;
	}

	if (url.pathname.startsWith(`/${accountId}`)) {
		// is managed registry and has the account id, passthrough
		return image;
	}

	// check if already looks like it has an account id (32 char hex string)
	const accountIdPattern = /^\/([a-f0-9]{32})\//;
	const match = accountIdPattern.exec(url.pathname);
	if (match) {
		const foundAccountId = match[1];
		if (foundAccountId !== accountId) {
			throw new Error(
				`Image "${image}" does not belong to your account\nImage appears to belong to account: "${foundAccountId}"\nCurrent account: "${accountId}"`
			);
		}
		return image;
	}

	// is managed registry and doesn't have the account id,add it to the path
	return `${url.hostname}/${accountId}${url.pathname}`;
}

/**
 * Get type of container registry, and validate.
 * We support Cloudflare managed registries plus the external registries listed in
 * `acceptedRegistries` below (currently AWS ECR, DockerHub, and Google Artifact Registry).
 * When using Cloudflare managed registries we expect CLOUDFLARE_CONTAINER_REGISTRY to be set
 */
export const getAndValidateRegistryType = (domain: string): RegistryPattern => {
	// TODO: use parseImageName when that gets moved to this package
	if (domain.includes("://")) {
		throw new Error(
			`${domain} is invalid:\nImage reference should not include the protocol part (e.g: registry.cloudflare.com rather than https://registry.cloudflare.com)`
		);
	}
	let url: URL;
	try {
		url = new URL(`http://${domain}`);
	} catch (e) {
		if (e instanceof Error) {
			throw new Error(`${domain} is invalid:\n${e.message}`);
		}
		throw e;
	}

	const acceptedRegistries: RegistryPattern[] = [
		{
			type: ExternalRegistryKind.ECR,
			pattern: /^[0-9]{12}\.dkr\.ecr\.[a-z0-9-]+\.amazonaws\.com$/,
			name: "AWS ECR",
			secretType: "AWS Secret Access Key",
		},
		{
			type: ExternalRegistryKind.DOCKER_HUB,
			pattern: /^docker\.io$/,
			name: "DockerHub",
			secretType: "DockerHub PAT Token",
		},
		{
			type: ExternalRegistryKind.GAR,
			pattern: /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?-docker\.pkg\.dev$/,
			name: "Google Artifact Registry",
			secretType: "Google Service Account JSON Key",
		},
		{
			type: "cloudflare",
			// Make a regex based on the env var CLOUDFLARE_CONTAINER_REGISTRY
			pattern: new RegExp(
				`^${getCloudflareContainerRegistry().replace(/[\\.]/g, "\\$&")}$`
			),
			name: "Cloudflare Containers Managed Registry",
		},
	];

	const match = acceptedRegistries.find((registry) =>
		registry.pattern.test(url.hostname)
	);

	if (!match) {
		const supportedRegistries = acceptedRegistries
			.filter((r) => r.type !== "cloudflare")
			.map((r) => r.name)
			.join(", ");
		throw new UserError(
			`${url.hostname} is not a supported image registry.\nCurrently we support the following non-Cloudflare registries: ${supportedRegistries}.\nTo use an existing image from another repository, see https://developers.cloudflare.com/containers/platform-details/image-management/#using-pre-built-container-images`,
			{ telemetryMessage: false }
		);
	}

	return match;
};

interface RegistryPattern {
	type: ExternalRegistryKind | "cloudflare";
	secretType?: string;
	pattern: RegExp;
	name: string;
}

type ServiceAccountKey = {
	private_key: string;
	client_email: string;
	private_key_id?: string;
};

function invalidGarCredentialError(): UserError {
	return new UserError(
		"The Google service account key must be a JSON key file or its base64-encoded form.",
		{
			telemetryMessage:
				"containers registries configure invalid gar credential",
		}
	);
}

function tryParseJson(value: string): unknown | undefined {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return undefined;
	}
}

function assertJsonObject(parsed: unknown): Record<string, unknown> {
	if (typeof parsed !== "object" || parsed === null) {
		throw invalidGarCredentialError();
	}
	return parsed as Record<string, unknown>;
}

function validateServiceAccountKey(
	accountKey: Record<string, unknown>
): ServiceAccountKey {
	const privateKey = accountKey.private_key;
	const clientEmail = accountKey.client_email;
	const rawPrivateKeyId = accountKey.private_key_id;
	if (typeof privateKey !== "string" || typeof clientEmail !== "string") {
		throw new UserError(
			"The Google service account key is missing required fields (private_key, client_email).",
			{
				telemetryMessage:
					"containers registries configure gar credential missing fields",
			}
		);
	}
	if (privateKey.length === 0 || clientEmail.length === 0) {
		throw new UserError(
			"The Google service account key has an empty private_key or client_email.",
			{
				telemetryMessage:
					"containers registries configure gar credential empty fields",
			}
		);
	}
	let privateKeyId: string | undefined;
	if (rawPrivateKeyId === undefined) {
		privateKeyId = undefined;
	} else if (
		typeof rawPrivateKeyId === "string" &&
		rawPrivateKeyId.length > 0
	) {
		privateKeyId = rawPrivateKeyId;
	} else {
		throw new UserError(
			"The Google service account key has an empty or invalid private_key_id.",
			{
				telemetryMessage:
					"containers registries configure gar credential invalid private key id",
			}
		);
	}
	return {
		private_key: privateKey,
		client_email: clientEmail,
		private_key_id: privateKeyId,
	};
}

/**
 * Validates a Google service account JSON key and returns it base64-encoded for
 * storage as the private credential.
 *
 * Accepts the raw JSON key contents or its base64-encoded form. Throws a
 * `UserError` if the key is malformed, or if `expectedEmail` (the
 * `--gar-email` public credential) does not match the `client_email` in the key.
 */
export function validateAndEncodeGarKey(
	rawKey: string,
	expectedEmail: string
): string {
	const trimmed = rawKey.trim();

	let base64Key: string;
	let json: Record<string, unknown>;
	const rawJson = tryParseJson(trimmed);
	if (rawJson !== undefined) {
		json = assertJsonObject(rawJson);
		base64Key = Buffer.from(trimmed, "utf8").toString("base64");
	} else {
		if (trimmed.startsWith("-----BEGIN")) {
			throw new UserError(
				"The provided key appears to be a PEM private key. Provide the full Google service-account JSON key file, not just the private key.",
				{
					telemetryMessage:
						"containers registries configure gar credential pem key",
				}
			);
		}
		base64Key = trimmed.replace(/\s+/g, "");
		const decodedJson = tryParseJson(
			Buffer.from(base64Key, "base64").toString("utf8")
		);
		if (decodedJson === undefined) {
			throw invalidGarCredentialError();
		}
		json = assertJsonObject(decodedJson);
	}

	const key = validateServiceAccountKey(json);

	if (key.client_email !== expectedEmail) {
		throw new UserError(
			`The provided --gar-email "${expectedEmail}" does not match the service account email "${key.client_email}" in the key.`,
			{
				telemetryMessage: "containers registries configure gar email mismatch",
			}
		);
	}

	return base64Key;
}
