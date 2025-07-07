import { spawn } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { BuildArgs, ContainerDevOptions, Logger } from "./types";

export async function constructBuildCommand(
	options: BuildArgs,
	/** wrangler config path. used to resolve relative dockerfile path */
	configPath: string | undefined,
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
	const baseDir = configPath ? path.dirname(configPath) : process.cwd();
	const absDockerfilePath = path.resolve(baseDir, options.pathToDockerfile);
	const dockerfile = readFileSync(absDockerfilePath, "utf-8");
	// pipe in the dockerfile
	buildCmd.push("-f", "-");
	buildCmd.push(options.buildContext ?? path.dirname(absDockerfilePath));
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

export async function buildImage(
	dockerPath: string,
	options: ContainerDevOptions,
	configPath: string | undefined
) {
	// just let the tag default to latest
	const { buildCmd, dockerfile } = await constructBuildCommand(
		{
			tag: options.imageTag,
			pathToDockerfile: options.image,
			buildContext: options.imageBuildContext,
			args: options.args,
			platform: "linux/amd64",
		},
		configPath
	);

	await dockerBuild(dockerPath, { buildCmd, dockerfile });
}
