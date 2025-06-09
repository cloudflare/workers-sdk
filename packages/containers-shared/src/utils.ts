import { spawn, StdioOptions } from "child_process";

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
