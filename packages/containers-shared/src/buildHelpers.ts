import { BuildArgs, Logger } from "./types";

export async function constructBuildCommand(
	options: BuildArgs,
	logger?: Logger
) {
	const platform = options.platform ?? "linux/amd64";
	const buildCmd = ["build", "-t", options.tag, "--platform", platform];

	if (options.args) {
		for (const arg in options.args) {
			buildCmd.push("--build-arg", `${arg}=${options.args[arg]}`);
		}
	}
	if (options.setNetworkToHost) {
		buildCmd.push("--network", "host");
	}

	buildCmd.push("-f", options.pathToDockerfile);
	buildCmd.push(options.buildContext);
	logger?.debug(`Building image with command: ${buildCmd.join(" ")}`);
	return buildCmd;
}
