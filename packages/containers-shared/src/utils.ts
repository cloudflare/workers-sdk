import { execFile, spawn } from "child_process";
import { randomUUID } from "crypto";
import { existsSync, statSync } from "fs";
import path from "path";
import { dockerImageInspect } from "./inspect";
import { type ContainerDevOptions } from "./types";
import type { StdioOptions } from "child_process";

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
			reject(new Error(`Docker command exited with code: ${code}`));
		}
	});
	child.on("error", (err) => {
		if (!errorHandled) {
			errorHandled = true;
			reject(new Error(`Docker command failed: ${err.message}`));
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
		then: async (resolve, reject) => ready.then(resolve).catch(reject),
	};
};

export const runDockerCmdWithOutput = async (
	dockerPath: string,
	args: string[]
): Promise<string> => {
	return new Promise((resolve, reject) => {
		execFile(dockerPath, args, (error, stdout) => {
			if (error) {
				return reject(
					new Error(
						`Failed running docker command: ${error.message}. Command: ${dockerPath} ${args.join(" ")}`
					)
				);
			}
			return resolve(stdout.trim());
		});
	});
};

/** throws when docker is not installed */
export const verifyDockerInstalled = async (
	dockerPath: string,
	isDev = true
) => {
	try {
		await runDockerCmd(dockerPath, ["info"], ["inherit", "pipe", "pipe"]);
	} catch {
		// We assume this command is unlikely to fail for reasons other than the Docker daemon not running, or the Docker CLI not being installed or in the PATH.
		throw new Error(
			`The Docker CLI could not be launched. Please ensure that the Docker CLI is installed and the daemon is running.\n` +
				`Other container tooling that is compatible with the Docker CLI and engine may work, but is not yet guaranteed to do so. You can specify an executable with the environment variable WRANGLER_DOCKER_BIN and a socket with WRANGLER_DOCKER_HOST.` +
				`${isDev ? "\nTo suppress this error if you do not intend on triggering any container instances, set dev.enable_containers to false in your Wrangler config or passing in --enable-containers=false." : ""}`
		);
	}
};

export function isDir(path: string) {
	const stats = statSync(path);
	return stats.isDirectory();
}

/** returns true if it is a dockerfile, false if it is a registry link, throws if neither */
export const isDockerfile = (
	image: string,
	configPath: string | undefined
): boolean => {
	const baseDir = configPath ? path.dirname(configPath) : process.cwd();
	const maybeDockerfile = path.resolve(baseDir, image);
	if (existsSync(maybeDockerfile)) {
		if (isDir(maybeDockerfile)) {
			throw new Error(
				`${image} is a directory, you should specify a path to the Dockerfile`
			);
		}
		return true;
	}

	const errorPrefix = `The image "${image}" does not appear to be a valid path to a Dockerfile, or a valid image registry path:\n`;
	// not found, not a dockerfile, let's try parsing the image ref as an URL?
	try {
		new URL(`https://${image}`);
	} catch (e) {
		if (e instanceof Error) {
			throw new Error(errorPrefix + e.message);
		}
		throw e;
	}
	const imageParts = image.split("/");

	if (!imageParts[imageParts.length - 1]?.includes(":")) {
		throw new Error(
			errorPrefix +
				`If this is an image registry path, it needs to include at least a tag ':' (e.g: docker.io/httpd:1)`
		);
	}

	// validate URL
	if (image.includes("://")) {
		throw new Error(
			errorPrefix +
				`Image reference should not include the protocol part (e.g: docker.io/httpd:1, not https://docker.io/httpd:1)`
		);
	}
	return false;
};

/**
 * Kills and removes any containers which come from the given image tag
 *
 * Please note that this function has an almost identical counterpart
 * in the `vite-plugin-cloudflare` package (see `removeContainersByIds`).
 * If you make any changes to this fn, please make sure you persist those
 * changes in `removeContainersByIds` if necessary.
 */
export const cleanupContainers = async (
	dockerPath: string,
	imageTags: Set<string>
) => {
	try {
		// Find all containers (stopped and running) for each built image
		const containerIds = await getContainerIdsByImageTags(
			dockerPath,
			imageTags
		);

		if (containerIds.length === 0) {
			return true;
		}

		// Workerd should have stopped all containers, but clean up any in case. Sends a sigkill.
		await runDockerCmd(
			dockerPath,
			["rm", "--force", ...containerIds],
			["inherit", "pipe", "pipe"]
		);
		return true;
	} catch (error) {
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
export async function getContainerIdsByImageTags(
	dockerPath: string,
	imageTags: Set<string>
): Promise<Array<string>> {
	const ids = new Set<string>();

	for (const imageTag of imageTags) {
		const containerIdsFromImage = await getContainerIdsFromImage(
			dockerPath,
			imageTag
		);
		containerIdsFromImage.forEach((id) => ids.add(id));
	}

	return Array.from(ids);
}

export const getContainerIdsFromImage = async (
	dockerPath: string,
	ancestorImage: string
) => {
	const output = await runDockerCmdWithOutput(dockerPath, [
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
		imageTag: options.imageTag,
		formatString: "{{ len .Config.ExposedPorts }}",
	});
	if (output === "0") {
		throw new Error(
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
