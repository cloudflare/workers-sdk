import { spawn } from "child_process";
import { stat } from "fs/promises";
import { crash, logRaw } from "@cloudflare/cli";
import { ImageRegistriesService } from "./client";
import type { Config } from "../config";
import type {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import type { ImageRegistryPermissions } from "./client";

// default cloudflare managed registry
const domain = "registry.cloudchamber.cfdata.org";

export async function dockerLoginManagedRegistry(options: {
	pathToDocker?: string;
}) {
	const dockerPath = options.pathToDocker ?? "docker";
	const expirationMinutes = 15;

	await ImageRegistriesService.generateImageRegistryCredentials(domain, {
		expiration_minutes: expirationMinutes,
		permissions: ["push"] as ImageRegistryPermissions[],
	}).then(async (credentials) => {
		const child = spawn(
			dockerPath,
			["login", "--password-stdin", "--username", "v1", domain],
			{ stdio: ["pipe", "inherit", "inherit"] }
		).on("error", (err) => {
			throw err;
		});
		child.stdin.write(credentials.password);
		child.stdin.end();
		await new Promise((resolve) => {
			child.on("close", resolve);
		});
	});
}

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
	const imageTag = domain + "/" + options.imageTag;
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
			defaultBuildCommand.push(`--build-arg='${arg}=${options.args[arg]}'`);
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

async function tagImage(original: string, newTag: string, dockerPath: string) {
	const child = spawn(dockerPath, ["tag", original, newTag]).on(
		"error",
		(err) => {
			throw err;
		}
	);
	await new Promise((resolve) => {
		child.on("close", resolve);
	});
}

export async function push(options: {
	imageTag?: string;
	pathToDocker?: string;
}): Promise<string> {
	if (typeof options.imageTag === "undefined") {
		throw new Error("Must provide an image tag when pushing");
	}
	// TODO: handle non-managed registry?
	const imageTag = domain + "/" + options.imageTag;
	const dockerPath = options.pathToDocker ?? "docker";
	await tagImage(options.imageTag, imageTag, dockerPath);
	const child = spawn(dockerPath, ["image", "push", imageTag], {
		stdio: "inherit",
	}).on("error", (err) => {
		throw err;
	});
	await new Promise((resolve) => {
		child.on("close", resolve);
	});
	return imageTag;
}

export function buildYargs(yargs: CommonYargsArgvJSON) {
	return yargs
		.positional("PATH", {
			type: "string",
			describe: "Path for the directory containing the Dockerfile to build",
			demandOption: true,
		})
		.option("tag", {
			alias: "t",
			type: "string",
			demandOption: true,
			describe: 'Name and optionally a tag (format: "name:tag")',
		})
		.option("path-to-docker", {
			type: "string",
			default: "docker",
			describe: "Path to your docker binary if it's not on $PATH",
			demandOption: false,
		})
		.option("push", {
			alias: "p",
			type: "boolean",
			describe: "Push the built image to Cloudflare's managed registry",
			default: false,
		})
		.option("platform", {
			type: "string",
			default: "linux/amd64",
			describe:
				"Platform to build for. Defaults to the architecture support by Workers (linux/amd64)",
			demandOption: false,
		});
}

export function pushYargs(yargs: CommonYargsArgvJSON) {
	return yargs
		.option("path-to-docker", {
			type: "string",
			default: "docker",
			describe: "Path to your docker binary if it's not on $PATH",
			demandOption: false,
		})
		.positional("TAG", { type: "string", demandOption: true });
}

async function isDir(path: string): Promise<boolean> {
	const stats = await stat(path);
	return stats.isDirectory();
}

export async function build(args: {
	tag: string;
	pathToDockerfileDirectory: string;
	pathToDocker: string;
	push: boolean;
	// specify the contents of the dockerfile if not wanting to use the dockerfile directory
	dockerfileContents?: string;
	args?: Record<string, string>;
}): Promise<string> {
	try {
		const dir = await isDir(args.pathToDockerfileDirectory);
		if (!dir) {
			crash(`PATH must be a directory`);
		}
	} catch (error) {
		crash(`Error when checking ${args.pathToDockerfileDirectory}: ${error}`);
	}

	try {
		const bc = await constructBuildCommand({
			imageTag: args.tag,
			pathToDockerfile: args.pathToDockerfileDirectory,
			pathToDocker: args.pathToDocker,
			dockerfile: args.dockerfileContents,
		});
		await dockerBuild({ buildCmd: bc, dockerfile: args.dockerfileContents });

		if (args.push) {
			await dockerLoginManagedRegistry({
				pathToDocker: args.pathToDocker,
			});

			return await push({ imageTag: args.tag });
		}

		return args.tag;
	} catch (error) {
		if (error instanceof Error) {
			crash(error.message);
		} else {
			crash("An unknown error occurred");
		}
	}
}

export async function buildCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof buildYargs>,
	_: Config
) {
	await build({
		tag: args.tag,
		pathToDockerfileDirectory: args.PATH,
		pathToDocker: args.pathToDocker,
		push: args.push,
	});
}

export async function pushCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof pushYargs>,
	_: Config
) {
	try {
		await dockerLoginManagedRegistry({
			pathToDocker: args.pathToDocker,
		}).then(async () => {
			await push({ imageTag: args.TAG });
		});
	} catch (error) {
		if (error instanceof Error) {
			logRaw(error.message);
		} else {
			logRaw("An unknown error occurred");
		}
	}
}
