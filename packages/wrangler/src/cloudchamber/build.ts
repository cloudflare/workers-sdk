import { spawn } from "child_process";
import { ImageRegistriesService } from "./client";
import type { Config } from "../config";
import type {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import type { ImageRegistryPermissions } from "./client";

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
		console.log("error");
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
export async function dockerBuild(options: {
	buildCmd: string;
	verbose: boolean;
}) {
	const buildCmd = options.buildCmd.split(" ").slice(1);
	const buildExec = options.buildCmd.split(" ").shift();
	const child = spawn(String(buildExec), buildCmd, { stdio: "pipe" });
	if (options.verbose) {
		child.stdout.on("data", (chunk: string) => {
			console.log(`From build stdout: ${chunk}`);
		});
		child.stderr.on("data", (chunk: string) => {
			console.log(`From build stderr: ${chunk}`);
		});
	}

	await new Promise((resolve) => {
		console.log("Image Built");
		child.on("exit", resolve);
	});
}

// Should this be a credhelper instead?
export async function dockerLoginManagedRegistry(options: {
	pathToDocker?: string;
	verbose?: boolean;
}) {
	const dockerPath = options.pathToDocker ?? "docker";
	const expirationMinutes = 15;

	try {
		await ImageRegistriesService.generateImageRegistryCredentials(domain, {
			expiration_minutes: expirationMinutes,
			permissions: ["push"] as ImageRegistryPermissions[],
		}).then(async (credentials) => {
			await console.log("got creds, logging in");
			const child = spawn(dockerPath, [
				"login",
				"--password-stdin",
				"--username",
				"v1",
				domain,
			]);
			child.stdin.write(credentials.password);
			child.stdin.end();
			if (options.verbose) {
				// TODO CDR: don't use console.log
				child.stdout.on("data", (chunk: string) => {
					console.log(`From login stdout: ${chunk}`);
				});
				child.stderr.on("data", (chunk: string) => {
					console.log(`From login stderr: ${chunk}`);
				});
			}
			await new Promise((resolve) => {
				console.log("Logged in");
				child.on("exit", resolve);
			});
		});
	} catch (err) {
		console.log(err);
		return;
	}
}

async function tagImage(original: string, newTag: string, dockerPath: string) {
	const child = spawn(dockerPath, ["tag", original, newTag]);
	await new Promise((resolve) => {
		console.log("image successfully tagged: ", newTag);
		child.on("close", resolve);
	});
}

export async function push(options: {
	imageTag?: string;
	pathToDocker?: string;
	verbose?: boolean;
}) {
	if (typeof options.imageTag === "undefined") {
		throw new Error("Must provide an image tag when pushing");
	}
	const imageTag = domain + "/" + options.imageTag;
	const dockerPath = options.pathToDocker ?? "docker";
	await tagImage(options.imageTag, imageTag, dockerPath);
	const child = spawn(dockerPath, ["image", "push", imageTag], {
		stdio: "pipe",
	});
	if (options.verbose) {
		child.stdout.on("data", (chunk: string) => {
			console.log(`From push stdout: ${chunk}`);
		});
		child.stderr.on("data", (chunk: string) => {
			console.log(`From push stderr: ${chunk}`);
		});
	}
	await new Promise((resolve) => {
		console.log("image successfully pushed: ", imageTag);
		child.on("close", resolve);
	});
}

export function buildYargs(yargs: CommonYargsArgvJSON) {
	return yargs
		.option("dockerFilePath", { type: "string", demandOption: false })
		.option("imageTag", { type: "string", demandOption: false })
		.option("pathToDocker", { type: "string", default: "docker" })
		.option("buildCommand", { type: "string", demandOption: false })
		.option("verbose", { type: "boolean", default: false })
		.option("push", { type: "boolean", default: false });
}

export function pushYargs(yargs: CommonYargsArgvJSON) {
	return yargs
		.option("verbose", { type: "boolean", default: false })
		.option("imageTag", { type: "string", demandOption: true })
		.option("pathToDocker", { type: "string", default: "docker" });
}

export async function buildCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof buildYargs>,
	config: Config
) {
	try {
		await constructBuildCommand({
			imageTag: args.imageTag,
			pathToDockerfile: args.dockerFilePath,
			pathToDocker: args.pathToDocker,
			customBuildCommand:
				// Use the command line build arg if it's passed, otherwise use the wrangler.toml build command.
				!args.buildCommand
					? config.cloudchamber.build_command
					: args.buildCommand,
		})
			.then(async (bc) => dockerBuild({ buildCmd: bc, verbose: args.verbose }))
			.then(async () => {
				if (args.push) {
					await dockerLoginManagedRegistry({
						verbose: args.verbose,
						pathToDocker: args.pathToDocker,
					}).then(
						async () =>
							await push({ imageTag: args.imageTag, verbose: args.verbose })
					);
				}
			});
	} catch (error) {
		console.log(error);
	}
}

export async function pushCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof pushYargs>,
	_: Config
) {
	try {
		// TODO: add check for non-managed registry being passed and alternate code path for that
		await dockerLoginManagedRegistry({
			verbose: args.verbose,
			pathToDocker: args.pathToDocker,
		}).then(async () => {
			await push({ imageTag: args.imageTag, verbose: args.verbose });
		});
	} catch (error) {
		console.log(error);
	}
}
