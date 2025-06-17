import { spawn } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { dockerImageInspect } from "./inspect";
import { MF_DEV_CONTAINER_PREFIX } from "./registry";
import { BuildArgs, ContainerDevOptions, Logger } from "./types";
import { verifyLocalDevSupported } from "./utils";

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

// TODO: this should also pull
export async function buildAllContainers(
	dockerPath: string,
	logger: Logger,
	containerOptions: ContainerDevOptions[]
) {
	await verifyLocalDevSupported(dockerPath);
	logger.info("Loading container image(s)...");
	for (const options of containerOptions) {
		await buildContainer(dockerPath, options);
	}
	// Miniflare will log 'Ready on...' before the containers are built, but that is actually the proxy server.
	// The actual user worker's miniflare instance is blocked until the containers are built
	logger.info("Container(s) built and ready");
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
	await checkExposedPorts(dockerPath, options.imageTag);
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
