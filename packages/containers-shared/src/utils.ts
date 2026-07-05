import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { UserError } from "@cloudflare/workers-utils";
import { dockerImageInspect } from "./inspect";
import type { ContainerDevOptions } from "./types";
import type { StdioOptions } from "node:child_process";

/** helper for simple docker command call that don't require any io handling */
export const runDockerCmd = (
	dockerPath: string,
	args: string[],
	stdio?: StdioOptions
): {
	abort: () => void;
	ready: Promise<{ aborted: boolean }>;
	// Note: we make the return type a thenable just for convenience so that callers can directly await it
	then: (resolve: () => void, reject: () => void) => void;
} => {
	let aborted = false;
	let resolve: (args: { aborted: boolean }) => void;
	let reject: (err: unknown) => void;
	const ready = new Promise<{ aborted: boolean }>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	const child = spawn(dockerPath, args, {
		stdio: stdio ?? "inherit",
		// We need to set detached to true so that the child process
		// will control all of its child processes and we can kill
		// all of them in case we need to abort the build process.
		// On Windows, detached: true opens a new console window per child
		// process, so we only set it on non-Windows platforms.
		detached: process.platform !== "win32",
		// Prevent child processes from opening visible console windows on Windows.
		// This is a no-op on non-Windows platforms.
		windowsHide: true,
	});
	let errorHandled = false;

	child.on("close", (code) => {
		if (code === 0 || aborted) {
			resolve({ aborted });
		} else if (!errorHandled) {
			errorHandled = true;
			reject(
				new UserError(`Docker command exited with code: ${code}`, {
					telemetryMessage: false,
				})
			);
		}
	});
	child.on("error", (err) => {
		if (!errorHandled) {
			errorHandled = true;
			reject(
				new UserError(`Docker command failed: ${err.message}`, {
					telemetryMessage: false,
				})
			);
		}
	});
	return {
		abort: () => {
			aborted = true;
			child.unref();
			if (child.pid !== undefined) {
				if (process.platform === "win32") {
					// On Windows, negative-PID process group kill is not supported.
					// Kill the child process directly instead.
					child.kill();
				} else {
					// Kill using the negative PID to terminate the whole process group
					// controlled by the child process.
					process.kill(-child.pid);
				}
			}
		},
		ready,
		then: async (onResolve, onReject) => ready.then(onResolve).catch(onReject),
	};
};

export const runDockerCmdWithOutput = (dockerPath: string, args: string[]) => {
	try {
		const stdout = execFileSync(dockerPath, args, { encoding: "utf8" });
		return stdout.trim();
	} catch (error) {
		throw new UserError(
			`Failed running docker command: ${(error as Error).message}. Command: ${dockerPath} ${args.join(" ")}`,
			{ telemetryMessage: false }
		);
	}
};

/** Checks whether docker is running on the system */
export const isDockerRunning = async (dockerPath: string) => {
	try {
		await runDockerCmd(dockerPath, ["info"], ["inherit", "pipe", "pipe"]);
	} catch {
		// We assume this command is unlikely to fail for reasons other than the Docker daemon not running, or the Docker CLI not being installed or in the PATH.
		return false;
	}
	return true;
};

/** Options for verifying that Docker is installed and the daemon is running. */
export type VerifyDockerInstalledOptions = {
	/** Path to the Docker CLI executable. */
	dockerPath: string;
	/**
	 * Human-readable description of the operation that requires Docker,
	 * e.g. `"running dev"`, `"deploying"`.
	 * When provided, the error headline reads "... before ${operation} ...".
	 * When omitted, the "before ..." clause is left out entirely.
	 */
	operation?: string;
	/**
	 * Noun describing what needs to be built, used in the error headline.
	 * For example `"the configured image"` or `"the configured images"`.
	 */
	imageNoun: string;
	/**
	 * Optional context-specific hint appended at the end of the error message.
	 * When omitted, no hint paragraph is included.
	 */
	hint?: string;
};

/**
 * Verifies that Docker is installed and the daemon is running.
 *
 * @throws {UserError} If the Docker CLI cannot be reached.
 *
 * @param options - Docker verification options.
 * @param options.dockerPath - Path to the Docker CLI executable.
 * @param options.operation - Optional human-readable operation description for the error message
 *   headline. When provided, produces "before ${operation}". When omitted, the clause is skipped.
 * @param options.imageNoun - Noun describing what needs to be built (e.g. "the configured image").
 * @param options.hint - Optional context-specific hint appended to the error message.
 */
export const verifyDockerInstalled = async ({
	dockerPath,
	operation,
	imageNoun,
	hint,
}: VerifyDockerInstalledOptions) => {
	const dockerIsRunning = await isDockerRunning(dockerPath);
	if (!dockerIsRunning) {
		throw new UserError(
			getFailedToRunDockerErrorMessage({
				operation,
				imageNoun,
				hint,
			}),
			{
				telemetryMessage: false,
			}
		);
	}
};

/**
 * Builds the user-facing error message shown when Docker cannot be reached.
 *
 * @param options - Options controlling the error message content.
 * @param options.operation - Optional human-readable operation description for the headline.
 * @param options.imageNoun - Noun describing what needs to be built.
 * @param options.hint - Optional context-specific hint paragraph.
 *
 * @returns The formatted error message string.
 */
function getFailedToRunDockerErrorMessage({
	operation,
	imageNoun,
	hint,
}: Omit<VerifyDockerInstalledOptions, "dockerPath">): string {
	const beforeOperation = operation ? ` before ${operation}` : "";
	const headline = `The Docker CLI is needed to build ${imageNoun}${beforeOperation} but could not be launched.`;

	let daemonHint: string;
	if (process.platform === "darwin") {
		daemonHint = "open the Docker Desktop app or run `open -a Docker`";
	} else if (process.platform === "win32") {
		daemonHint = "open the Docker Desktop app";
	} else {
		daemonHint = "run `sudo systemctl start docker`";
	}

	const steps =
		"To fix this, try the following:\n" +
		"  - If Docker is not installed, download it from https://docs.docker.com/get-started/get-docker/\n" +
		`  - If Docker is installed but the daemon is not running,\n    ${daemonHint}.\n` +
		"  - If you use an alternative Docker-compatible CLI (e.g. Podman),\n    set the WRANGLER_DOCKER_BIN environment variable to its path and DOCKER_HOST to its socket.";

	const alternatives =
		"Note: Other container tooling that is compatible with the Docker CLI and engine may work, but is not yet guaranteed to do so.";

	let message = `${headline}\n${steps}\n\n${alternatives}`;
	if (hint) {
		message += `\n\n${hint}`;
	}

	return message;
}

/**
 * Kills and removes any containers which come from the given image tag
 */
export const cleanupContainers = (
	dockerPath: string,
	imageTags: Set<string>
) => {
	try {
		// Find all containers (stopped and running) for each built image
		const containerIds = getContainerIdsByImageTags(dockerPath, imageTags);

		if (containerIds.length === 0) {
			return true;
		}

		// Workerd should have stopped all containers, but clean up any in case. Sends a sigkill.
		runDockerCmdWithOutput(dockerPath, ["rm", "--force", ...containerIds]);
		return true;
	} catch {
		return false;
	}
};

/**
 * See https://docs.docker.com/reference/cli/docker/container/ls/#ancestor
 *
 * @param dockerPath The path to the Docker executable
 * @param imageTags A set of ancestor image tags
 * @returns The ids of all containers that share the given image tags as ancestors.
 */
export function getContainerIdsByImageTags(
	dockerPath: string,
	imageTags: Set<string>
): string[] {
	const ids = new Set<string>();

	for (const imageTag of imageTags) {
		const containerIdsFromImage = getContainerIdsFromImage(
			dockerPath,
			imageTag
		);
		containerIdsFromImage.forEach((id) => ids.add(id));
	}

	return Array.from(ids);
}

export const getContainerIdsFromImage = (
	dockerPath: string,
	ancestorImage: string
) => {
	const output = runDockerCmdWithOutput(dockerPath, [
		"ps",
		"-a",
		"--filter",
		`ancestor=${ancestorImage}`,
		"--format",
		"{{.ID}}",
	]);
	return output.split("\n").filter((line) => line.trim());
};

/**
 * While all ports are exposed in prod, a limitation of local dev with docker is that
 * users will have to manually expose ports in their Dockerfile.
 * We want to fail early and clearly if a user tries to develop with a container
 * that has no ports exposed and is definitely not accessible.
 *
 * (A user could still use `getTCPPort()` on a port that is not exposed, but we leave that error for runtime.)
 */
export async function checkExposedPorts(
	dockerPath: string,
	options: ContainerDevOptions
) {
	const output = await dockerImageInspect(dockerPath, {
		imageTag: options.image_tag,
		formatString: "{{ len .Config.ExposedPorts }}",
	});
	if (output === "0") {
		throw new UserError(
			`The container "${options.class_name}" does not expose any ports. In your Dockerfile, please expose any ports you intend to connect to.\n` +
				"For additional information please see: https://developers.cloudflare.com/containers/local-dev/#exposing-ports.\n",
			{ telemetryMessage: false }
		);
	}
}

/**
 * Generates a random container build id
 */
export function generateContainerBuildId() {
	return randomUUID().slice(0, 8);
}

/**
 * Output of docker context ls --format json
 */
type DockerContext = {
	Current: boolean;
	Description: string;
	DockerEndpoint: string;
	Error: string;
	Name: string;
};

/**
 * Run `docker context ls` to get the socket from the currently active Docker context
 * @returns The socket path or null if we are not able to determine it
 */
export function getDockerSocketFromContext(dockerPath: string): string | null {
	try {
		const output = runDockerCmdWithOutput(dockerPath, [
			"context",
			"ls",
			"--format",
			"json",
		]);

		// Parse each line as a separate JSON object
		const lines = output.trim().split("\n");
		const contexts: DockerContext[] = lines.map((line) => JSON.parse(line));

		// Find the current context
		const currentContext = contexts.find((context) => context.Current === true);

		if (currentContext && currentContext.DockerEndpoint) {
			return currentContext.DockerEndpoint;
		}
	} catch {
		// Fall back to null if docker context inspection fails so that we can use platform defaults
	}
	return null;
}
/**
 * Resolve Docker host as follows:
 * 1. Check WRANGLER_DOCKER_HOST environment variable
 * 2. Check DOCKER_HOST environment variable
 * 3. Try to get socket from active Docker context
 * 4. Fall back to platform-specific defaults
 */
export function resolveDockerHost(dockerPath: string): string {
	if (process.env.WRANGLER_DOCKER_HOST) {
		return process.env.WRANGLER_DOCKER_HOST;
	}

	if (process.env.DOCKER_HOST) {
		return process.env.DOCKER_HOST;
	}

	// 3. Try to get socket from by running `docker context ls`

	const contextSocket = getDockerSocketFromContext(dockerPath);
	if (contextSocket) {
		return contextSocket;
	}

	// 4. Fall back to platform-specific defaults.
	// On Windows this is the Docker Desktop named pipe; miniflare bridges it to a
	// loopback TCP address before handing it to workerd (see containers-shared/docker-proxy).
	return process.platform === "win32"
		? "//./pipe/docker_engine"
		: "unix:///var/run/docker.sock";
}

/**
 * Get all repository tags for a given image
 */
export async function getImageRepoTags(
	dockerPath: string,
	imageTag: string
): Promise<string[]> {
	try {
		const output = await dockerImageInspect(dockerPath, {
			imageTag,
			formatString: "{{ range .RepoTags }}{{ . }}\n{{ end }}",
		});
		return output.split("\n").filter((tag) => tag.trim() !== "");
	} catch {
		return [];
	}
}

/**
 * Checks if the given image has any duplicate tags from previous dev sessions,
 * and remove them if so.
 */
export async function cleanupDuplicateImageTags(
	dockerPath: string,
	imageTag: string
): Promise<void> {
	try {
		const repoTags = await getImageRepoTags(dockerPath, imageTag);
		const currentBuildId = getImageTag(imageTag);
		// Remove all cloudflare-dev tags from previous sessions except the current dev session.
		const tagsToRemove = repoTags.filter(
			(tag) =>
				tag.startsWith("cloudflare-dev") && getImageTag(tag) !== currentBuildId
		);
		if (tagsToRemove.length > 0) {
			runDockerCmdWithOutput(dockerPath, ["rmi", ...tagsToRemove]);
		}
	} catch {}
}

function getImageTag(imageTag: string): string | undefined {
	const tagSeparatorIndex = imageTag.lastIndexOf(":");
	return tagSeparatorIndex === -1
		? undefined
		: imageTag.slice(tagSeparatorIndex + 1);
}
