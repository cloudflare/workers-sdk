import { spawn } from "child_process";
import { stat } from "fs/promises";
import {
	constructBuildCommand,
	dockerBuild,
	ImageRegistriesService,
	REGISTRY_DOMAIN,
	tagImage,
} from "@cloudflare/containers-shared";
import { UserError } from "../errors";
import type { Config } from "../config";
import type {
	CommonYargsArgvJSON,
	StrictYargsOptionsToInterfaceJSON,
} from "../yargs-types";
import type { ImageRegistryPermissions } from "@cloudflare/containers-shared";

export async function dockerLoginManagedRegistry(options: {
	pathToDocker?: string;
}) {
	const dockerPath = options.pathToDocker ?? "docker";
	const expirationMinutes = 15;

	await ImageRegistriesService.generateImageRegistryCredentials(
		REGISTRY_DOMAIN,
		{
			expiration_minutes: expirationMinutes,
			permissions: ["push"] as ImageRegistryPermissions[],
		}
	).then(async (credentials) => {
		const child = spawn(
			dockerPath,
			["login", "--password-stdin", "--username", "v1", REGISTRY_DOMAIN],
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

export async function push(options: {
	imageTag?: string;
	pathToDocker?: string;
}): Promise<string> {
	if (typeof options.imageTag === "undefined") {
		throw new Error("Must provide an image tag when pushing");
	}
	// TODO: handle non-managed registry?
	const imageTag = REGISTRY_DOMAIN + "/" + options.imageTag;
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

export async function isDir(path: string): Promise<boolean> {
	const stats = await stat(path);
	return stats.isDirectory();
}

export type BuildArgs = {
	tag: string;
	pathToDockerfileDirectory: string;
	pathToDocker: string;
	push: boolean;
	// specify the contents of the dockerfile if not wanting to use the dockerfile directory
	dockerfileContents?: string;
	args?: Record<string, string>;
};

export async function build(args: BuildArgs): Promise<string> {
	try {
		const dir = await isDir(args.pathToDockerfileDirectory);
		if (!dir) {
			throw new UserError(
				`${args.pathToDockerfileDirectory} does not exist or is not a directory. Please specify a valid directory path.`
			);
		}
	} catch (error) {
		throw new UserError(
			`Error when checking ${args.pathToDockerfileDirectory}: ${error}`
		);
	}

	try {
		const bc = await constructBuildCommand({
			imageTag: args.tag,
			pathToDockerfile: args.pathToDockerfileDirectory,
			pathToDocker: args.pathToDocker,
			dockerfile: args.dockerfileContents,
			args: args.args,
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
			throw new UserError(error.message);
		}

		throw new UserError("An unknown error occurred");
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
			throw new UserError(error.message);
		}
		throw new UserError("An unknown error occurred");
	}
}
