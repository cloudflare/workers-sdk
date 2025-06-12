import { spawn, StdioOptions } from "child_process";
import { existsSync, statSync } from "fs";

/** helper for simple docker command call that don't require any io handling */
export const runDockerCmd = async (
	dockerPath: string,
	args: string[],
	stdio?: StdioOptions
) => {
	const child = spawn(dockerPath, args, {
		stdio: stdio ?? "inherit",
	});
	let errorHandled = false;
	await new Promise<void>((resolve, reject) => {
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
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
	});
};

export const verifyDockerInstalled = async (dockerPath: string) => {
	try {
		await runDockerCmd(dockerPath, ["info"], ["inherit", "pipe", "pipe"]);
	} catch {
		// We assume this command is unlikely to fail for reasons other than the Docker CLI not being installed or not being in the PATH.
		throw new Error(
			`The Docker CLI does not appear to installed. Please ensure that the Docker CLI is installed. You can specify an executable with the environment variable WRANGLER_CONTAINERS_DOCKER_PATH.\n` +
				`Other container tooling that is compatible with the Docker CLI may work, but is not yet guaranteed to do so.\n` +
				`To suppress this error if you do not intend on triggering any container instances, set dev.enable_containers to false in your Wrangler config or passing in --enable-containers=false.`
		);
	}
};

export function isDir(path: string) {
	const stats = statSync(path);
	return stats.isDirectory();
}

export const isDockerfile = (image: string): boolean => {
	// TODO: move this into config validation
	if (existsSync(image)) {
		if (isDir(image)) {
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

	if (!imageParts[imageParts.length - 1].includes(":")) {
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
