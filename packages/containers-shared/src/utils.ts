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
		// will control all of its child processed and we can kill
		// all of them in case we need to abort the build process
		detached: true,
	});
	let errorHandled = false;

	child.on("close", (code) => {
		if (code === 0 || aborted) {
			resolve({ aborted });
		} else if (!errorHandled) {
			errorHandled = true;
			reject(new UserError(`Docker command exited with code: ${code}`));
		}
	});
	child.on("error", (err) => {
		if (!errorHandled) {
			errorHandled = true;
			reject(new UserError(`Docker command failed: ${err.message}`));
		}
	});
	return {
		abort: () => {
			aborted = true;
			child.unref();
			if (child.pid !== undefined) {
				// kill run on the negative PID kills the whole group controlled by the child process
				process.kill(-child.pid);
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
			`Failed running docker command: ${(error as Error).message}. Command: ${dockerPath} ${args.join(" ")}`
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

/** throws when docker is not installed */
export const verifyDockerInstalled = async (
	dockerPath: string,
	isDev = true
) => {
	const dockerIsRunning = await isDockerRunning(dockerPath);
	if (!dockerIsRunning) {
		throw new UserError(
			`The Docker CLI could not be launched. Please ensure that the Docker CLI is installed and the daemon is running.\n` +
				`Other container tooling that is compatible with the Docker CLI and engine may work, but is not yet guaranteed to do so. You can specify an executable with the environment variable WRANGLER_DOCKER_BIN and a socket with DOCKER_HOST.` +
				`${isDev ? "\nTo suppress this error if you do not intend on triggering any container instances, set dev.enable_containers to false in your Wrangler config or passing in --enable-containers=false." : ""}`
		);
	}
};

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
				"For additional information please see: https://developers.cloudflare.com/containers/local-dev/#exposing-ports.\n"
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

	// 4. Fall back to platform-specific defaults
	// (note windows doesn't work yet due to a runtime limitation)
	return process.platform === "win32"
		? "//./pipe/docker_engine"
		: "unix:///var/run/docker.sock";
}

/**
 *
 * Get docker host from environment variables or platform defaults.
 * Does not use the docker context ls command, so we
 */
export const getDockerHostFromEnv = (): string => {
	const fromEnv = process.env.WRANGLER_DOCKER_HOST ?? process.env.DOCKER_HOST;

	return fromEnv ?? process.platform === "win32"
		? "//./pipe/docker_engine"
		: "unix:///var/run/docker.sock";
};

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
		// Remove all cloudflare-dev tags from previous sessions except the current one
		const tagsToRemove = repoTags.filter(
			(tag) => tag !== imageTag && tag.startsWith("cloudflare-dev")
		);
		if (tagsToRemove.length > 0) {
			runDockerCmdWithOutput(dockerPath, ["rmi", ...tagsToRemove]);
		}
	} catch {}
}
