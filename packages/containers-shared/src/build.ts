import { spawn } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { dockerImageInspect } from "./inspect";
import { MF_DEV_CONTAINER_PREFIX } from "./registry";
import { BuildArgs, ContainerDevOptions, Logger } from "./types";
import { verifyDockerInstalled } from "./utils";

export async function constructBuildCommand(
	options: BuildArgs,
	logger?: Logger
) {
	const platform = options.platform ?? "linux/amd64";
	const buildCmd = [
		"build",
		"-t",
		options.tag,
		"--platform",
		platform,
		"--provenance=false",
	];

	if (options.args) {
		for (const arg in options.args) {
			buildCmd.push("--build-arg", `${arg}=${options.args[arg]}`);
		}
	}
	if (options.setNetworkToHost) {
		buildCmd.push("--network", "host");
	}
	const dockerfile = readFileSync(options.pathToDockerfile, "utf-8");
	// pipe in the dockerfile
	buildCmd.push("-f", "-");
	buildCmd.push(options.buildContext);
	logger?.debug(`Building image with command: ${buildCmd.join(" ")}`);
	return { buildCmd, dockerfile };
}

export function dockerBuild(
	dockerPath: string,
	options: {
		buildCmd: string[];
		dockerfile: string;
	}
): Promise<void> {
	let errorHandled = false;
	return new Promise((resolve, reject) => {
		const child = spawn(dockerPath, options.buildCmd, {
			stdio: ["pipe", "inherit", "inherit"],
		});
		if (child.stdin !== null) {
			child.stdin.write(options.dockerfile);
			child.stdin.end();
		}

		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else if (!errorHandled) {
				errorHandled = true;
				reject(new Error(`Build exited with code: ${code}`));
			}
		});
		child.on("error", (err) => {
			if (!errorHandled) {
				errorHandled = true;
				reject(err);
			}
		});
	});
}

/**
 *
 * Builds (or pulls - TODO) the container images for local development. This
 * will be called before starting the local development server, and by a rebuild
 * hotkey during development.
 *
 * Because this runs when local dev starts, we also do some validation here,
 * such as checking if the Docker CLI is installed, and if the container images
 * expose any ports.
 */
export async function prepareContainerImagesForDev(
	dockerPath: string,
	containerOptions: ContainerDevOptions[]
) {
	if (process.platform === "win32") {
		throw new Error(
			"Local development with containers is currently not supported on Windows. You should use WSL instead. You can also set `enable_containers` to false if you do not need to develop the container part of your application."
		);
	}
	await verifyDockerInstalled(dockerPath);
	for (const options of containerOptions) {
		await buildContainer(dockerPath, options);
		await checkExposedPorts(dockerPath, options.imageTag);
	}
}

async function buildContainer(
	dockerPath: string,
	options: ContainerDevOptions
) {
	// just let the tag default to latest
	const { buildCmd, dockerfile } = await constructBuildCommand({
		tag: options.imageTag,
		pathToDockerfile: options.image,
		buildContext: options.imageBuildContext ?? path.dirname(options.image),
		args: options.args,
		platform: "linux/amd64",
	});

	await dockerBuild(dockerPath, { buildCmd, dockerfile });
}

async function checkExposedPorts(dockerPath: string, imageTag: string) {
	const output = await dockerImageInspect(dockerPath, {
		imageTag,
		formatString: "{{ len .Config.ExposedPorts }}",
	});
	if (output === "0" && process.platform !== "linux") {
		throw new Error(
			`The container "${imageTag.replace(MF_DEV_CONTAINER_PREFIX + "/", "")}" does not expose any ports.\n` +
				"To develop containers locally on non-Linux platforms, you must expose any ports that you call with `getTCPPort()` in your Dockerfile."
		);
	}
}
