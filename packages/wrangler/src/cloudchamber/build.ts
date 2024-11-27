import { ImageRegistriesService } from "./client";
import type { Config } from "../config";
import type {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import type { ImageRegistryPermissions } from "./client";

const domain = "registry.cloudchamber.cfdata.org";

export async function constructBuildCommand(options: {
	imageTag?: string;
	pathToDocker?: string;
	pathToDockerfile: string;
	platform?: string;
	customBuildCommand?: string;
}) {
	const dockerFilePath = options.pathToDockerfile;
	const dockerPath = options.pathToDocker ? options.pathToDocker : "docker";
	const imageTag = domain + "/" + options.imageTag;
	const platform = options.desiredPlatform
		? options.desiredPlatform
		: "linux/amd64";
	const defaultBuildCommand = [
		"build",
		"-t",
		imageTag,
		"--platform",
		platform,
		dockerFilePath,
	].join(" ");
	const buildCommand = options.customBuildCommand
		? options.customBuildCommand
		: defaultBuildCommand;
	// TODO: don't use console.log
	console.log("Building image: ", imageTag);
	console.log("using command: ", buildCommand);
	return options.customBuildCommand
		? options.customBuildCommand
		: defaultBuildCommand;
}

// Function for building
export async function dockerBuild(options: {
	buildCommand: string;
	debug: bool;
}) {
	const buildCommand = options.buildCommand.split(" ").slice(1);
	const buildExec = options.buildCommand.split(" ").shift();
	const { spawn } = require("node:child_process");
	const child = spawn(buildExec, buildCommand, { stdio: "pipe" });
	if (options.debug) {
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

export async function dockerLoginManagedRegistry(pathToDocker?: string) {
	const dockerPath = pathToDocker ? pathToDocker : "docker";
	const expirationMinutes = 15;

	try {
		await ImageRegistriesService.generateImageRegistryCredentials(domain, {
			expiration_minutes: expirationMinutes,
			permissions: ["push"] as ImageRegistryPermissions[],
		}).then(async (credentials) => {
			await console.log("got creds, logging in");
			const { spawn } = require("node:child_process");
			const child = spawn(dockerPath, [
				"login",
				"--password-stdin",
				"--username",
				"v1",
				domain,
			]);
			child.stdin.write(credentials.password);
			child.stdin.end();
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

// function for pushing
export async function push(options: {
	imageTag: string;
	pathToDocker?: string;
}) {
	const imageTag = domain + "/" + options.imageTag;
	await console.log("pushing image: ", imageTag);
	const { spawn } = require("node:child_process");
	const dockerPath = options.pathToDocker ? options.pathToDocker : "docker";
	const child = spawn(dockerPath, ["image", "push", imageTag], {
		stdio: "pipe",
	});
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
		.option("debug", { type: "bool", demandOption: false });
}

export function pushYargs(yargs: CommonYargsArgvJSON) {
	return yargs
		.option("imageTag", { type: "string", demandOption: true })
		.option("pathToDocker", { type: "string", default: "docker" });
}

// basic command to add
export async function buildCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof buildYargs>,
	config: Config
) {
	console.log(config.cloudchamber);
	console.log("build_command:", config.cloudchamber.build_command);
	const buildCommand = await constructBuildCommand({
		imageTag: args.imageTag,
		pathToDockerfile: args.dockerFilePath,
		config: config,
		buildCommand:
			// Use the command line build arg if it's passed, otherwise use the wrangler.toml build command.
			!args.buildCommand
				? config.cloudchamber.build_command
				: args.buildCommand,
		debug: args.debug,
	}).then((bc) => dockerBuild({ buildCommand: bc, debug: args.debug }));
}

export async function pushCommand(
	args: StrictYargsOptionsToInterfaceJSON<typeof pushYargs>,
	config: Config
) {
	// TODO: add support for non-managed registry
	await dockerLoginManagedRegistry().then(async () => {
		await push({ imageTag: args.imageTag });
	});
}
