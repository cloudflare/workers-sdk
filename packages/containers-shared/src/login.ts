import { spawn } from "node:child_process";
import { UserError } from "@cloudflare/workers-utils";
import { ImageRegistriesService, ImageRegistryPermissions } from "./client";

/**
 * Gets push and pull credentials for a configured image registry
 * and runs `docker login`, so subsequent image pushes or pulls are
 * authenticated
 */
export async function dockerLoginImageRegistry(
	pathToDocker: string,
	domain: string
) {
	// how long the credentials should be valid for
	const expirationMinutes = 15;

	const credentials =
		await ImageRegistriesService.generateImageRegistryCredentials(domain, {
			expiration_minutes: expirationMinutes,
			permissions: [
				ImageRegistryPermissions.PUSH,
				ImageRegistryPermissions.PULL,
			],
		});

	const child = spawn(
		pathToDocker,
		["login", "--password-stdin", "--username", credentials.username, domain],
		{ stdio: ["pipe", "inherit", "inherit"] }
	).on("error", (err) => {
		throw err;
	});

	child.stdin.write(credentials.password);
	child.stdin.end();
	await new Promise<void>((resolve, reject) => {
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new UserError(`Login failed with code: ${code}`));
			}
		});
	});
}
