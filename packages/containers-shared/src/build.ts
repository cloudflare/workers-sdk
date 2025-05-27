import { spawn } from "child_process";

// default cloudflare managed registry
export const REGISTRY_DOMAIN = "registry.cloudchamber.cfdata.org";

export const getDefaultRegistry = () => {
	return REGISTRY_DOMAIN;
};

export async function constructBuildCommand(options: {
	imageTag?: string;
	pathToDocker?: string;
	pathToDockerfile?: string;
	platform?: string;
	dockerfile?: string;
	args?: Record<string, string>;
}) {
	// require a tag if we provide dockerfile
	if (
		typeof options.pathToDockerfile !== "undefined" &&
		options.pathToDockerfile !== "" &&
		(typeof options.imageTag === "undefined" || options.imageTag === "")
	) {
		throw new Error("must provide an image tag if providing a docker file");
	}
	const dockerFilePath = options.pathToDockerfile;
	const dockerPath = options.pathToDocker ?? "docker";
	const imageTag = REGISTRY_DOMAIN + "/" + options.imageTag;
	const platform = options.platform ? options.platform : "linux/amd64";
	const defaultBuildCommand = [
		dockerPath,
		"build",
		"-t",
		imageTag,
		"--platform",
		platform,
	];

	if (options.args !== undefined) {
		for (const arg in options.args) {
			defaultBuildCommand.push("--build-arg", `${arg}=${options.args[arg]}`);
		}
	}

	if (options.dockerfile !== undefined) {
		defaultBuildCommand.push("-f", "-");
	}

	defaultBuildCommand.push(dockerFilePath ?? ".");
	return defaultBuildCommand.join(" ");
}

// Function for building
export function dockerBuild(options: {
	buildCmd: string;
	dockerfile?: string;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const buildCmd = options.buildCmd.split(" ").slice(1);
		const buildExec = options.buildCmd.split(" ").shift();
		const child = spawn(String(buildExec), buildCmd, {
			stdio: [
				options.dockerfile !== undefined ? "pipe" : undefined,
				"inherit",
				"inherit",
			],
		});
		if (child.stdin !== null) {
			child.stdin.write(options.dockerfile);
			child.stdin.end();
		}

		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Build exited with code: ${code}`));
			}
		});
	});
}
