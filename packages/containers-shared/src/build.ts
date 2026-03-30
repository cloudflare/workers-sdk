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
		// will control all of its child processes and we can kill
		// all of them in case we need to abort the build process.
		// On Windows, detached: true opens a new console window per child
		// process, so we only set it on non-Windows platforms.
		detached: process.platform !== "win32",
		// Prevent child processes from opening visible console windows on Windows.
		// This is a no-op on non-Windows platforms.
		windowsHide: true,
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
