import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { UserError } from "@cloudflare/workers-utils";
import type {
	BuildArgs,
	ContainerDevOptions,
	ImageURIConfig,
	WranglerLogger,
} from "./types";

export async function constructBuildCommand(
	options: BuildArgs,
	logger?: WranglerLogger
) {
	const platform = options.platform ?? "linux/amd64";
	const buildCmd = [
		"build",
		"--load",
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
): { abort: () => void; ready: Promise<void> } {
	let errorHandled = false;
	let resolve: () => void;
	let reject: (err: unknown) => void;
	const ready = new Promise<void>((res, rej) => {
		resolve = res;
		reject = rej;
	});

	const child = spawn(dockerPath, options.buildCmd, {
		stdio: ["pipe", "inherit", "inherit"],
		// We need to set detached to true so that the child process
		// will control all of its child processed and we can kill
		// all of them in case we need to abort the build process
		detached: true,
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
			reject(new UserError(`Docker build exited with code: ${code}`));
		}
	});
	child.on("error", (err) => {
		if (!errorHandled) {
			errorHandled = true;
			reject(err);
		}
	});
	return {
		abort: () => {
			child.unref();
			if (child.pid !== undefined) {
				// kill run on the negative PID kills the whole group controlled by the child process
				process.kill(-child.pid);
			}
		},
		ready,
	};
}

export async function buildImage(
	dockerPath: string,
	options: Exclude<ContainerDevOptions, ImageURIConfig>
) {
	const { buildCmd, dockerfile } = await constructBuildCommand({
		tag: options.image_tag,
		pathToDockerfile: options.dockerfile,
		buildContext: options.image_build_context,
		args: options.image_vars,
		platform: "linux/amd64",
	});

	return dockerBuild(dockerPath, { buildCmd, dockerfile });
}
