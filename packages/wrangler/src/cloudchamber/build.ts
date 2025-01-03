import { spawn } from "child_process";
import { logRaw } from "@cloudflare/cli";
import type { Config } from "../config";
import type {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";

// default cloudflare managed registry
const domain = "registry.cloudchamber.cfdata.org";

export async function constructBuildCommand(options: {
	imageTag?: string;
	pathToDocker?: string;
	pathToDockerfile?: string;
	platform?: string;
	customBuildCommand?: string;
}) {
	if (
		typeof options.customBuildCommand !== "undefined" &&
		options.customBuildCommand !== ""
	) {
		return options.customBuildCommand;
	}
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
	const imageTag = domain + "/" + options.imageTag;
	const platform = options.platform ? options.platform : "linux/amd64";
	const defaultBuildCommand = [
		dockerPath,
		"build",
		"-t",
		imageTag,
		"--platform",
		platform,
		dockerFilePath,
	].join(" ");

	return defaultBuildCommand;
}

// Function for building
export async function dockerBuild(options: { buildCmd: string }) {
	const buildCmd = options.buildCmd.split(" ").slice(1);
	const buildExec = options.buildCmd.split(" ").shift();
	const child = spawn(String(buildExec), buildCmd, { stdio: "inherit" });
	await new Promise((resolve) => {
		child.on("exit", resolve);
	});
}

async function tagImage(original: string, newTag: string, dockerPath: string) {
	const child = spawn(dockerPath, ["tag", original, newTag]);
	await new Promise((resolve) => {
		child.on("close", resolve);
	});
}

export async function push(options: {
	imageTag?: string;
	pathToDocker?: string;
}) {
	if (typeof options.imageTag === "undefined") {
		throw new Error("Must provide an image tag when pushing");
	}
	// TODO: handle non-managed registry?
	const imageTag = domain + "/" + options.imageTag;
	const dockerPath = options.pathToDocker ?? "docker";
	await tagImage(options.imageTag, imageTag, dockerPath);
	const child = spawn(dockerPath, ["image", "push", imageTag], {
		stdio: "inherit",
	});
	await new Promise((resolve) => {
		child.on("close", resolve);
	});
}

export function buildYargs(yargs: CommonYargsArgvJSON) {
	return yargs
		.positional("PATH", {
			type: "string",
			describe: "path for the directory containing the dockerfile",
			demandOption: true,
		})
		.option("tag", {
			alias: "t",
			type: "string",
			demandOption: true,
			describe: "Tag to use for the built image",
		})
		.option("path-to-docker", {
			type: "string",
			default: "docker",
			describe: "path to docker binary",
			demandOption: false,
		})
		.option("build-command", {
			type: "string",
			describe: "custom build command to use",
			demandOption: false,
		})
		.option("push", {
			alias: "p",
			type: "boolean",
			describe: "push the built image to a registry",
			default: false,
		})
		.option("platform", {
			type: "string",
			default: "linux/amd64",
			describe: "platform to build for",
			demandOption: false,
		});
}

export function pushYargs(yargs: CommonYargsArgvJSON) {
	return yargs
		.option("path-to-docker", {
			type: "string",
			default: "docker",
			describe: "path to docker binary",
			demandOption: false,
		})
		.positional("TAG", { type: "string", demandOption: true });
}

export async function buildCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof buildYargs>,
	config: Config
) {
	try {
		await constructBuildCommand({
			imageTag: args.tag,
			pathToDockerfile: args.PATH,
			pathToDocker: args.pathToDocker,
			customBuildCommand:
				// Use the command line build arg if it's passed, otherwise use the wrangler.toml build command.
				!args.buildCommand
					? config.cloudchamber.build_command
					: args.buildCommand,
		})
			.then(async (bc) => dockerBuild({ buildCmd: bc }))
			.then(async () => {
				if (args.push) {
					await push({ imageTag: args.tag });
				}
			});
	} catch (error) {
		if (error instanceof Error) {
			logRaw(error.message);
		} else {
			logRaw("An unknown error occurred");
		}
	}
}

export async function pushCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof pushYargs>,
	_: Config
) {
	try {
		await push({ imageTag: args.TAG });
	} catch (error) {
		if (error instanceof Error) {
			logRaw(error.message);
		} else {
			logRaw("An unknown error occurred");
		}
	}
}
