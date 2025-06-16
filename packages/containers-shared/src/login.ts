import { spawn } from "node:child_process";
import { ImageRegistriesService, ImageRegistryPermissions } from "./client";
import { getCloudflareContainerRegistry } from "./knobs";

/**
 * Gets push credentials for cloudflare's managed image registry
 * and runs `docker login`, so subsequent image pushes are authenticated
 */
export async function dockerLoginManagedRegistry(pathToDocker: string) {
	// how long the credentials should be valid for
	const expirationMinutes = 15;

	const credentials =
		await ImageRegistriesService.generateImageRegistryCredentials(
			getCloudflareContainerRegistry(),
			{
				expiration_minutes: expirationMinutes,
				permissions: ["push"] as ImageRegistryPermissions[],
			}
		);

	const child = spawn(
		pathToDocker,
		[
			"login",
			"--password-stdin",
			"--username",
			"v1",
			getCloudflareContainerRegistry(),
		],
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
				reject(new Error(`Login failed with code: ${code}`));
			}
		});
	});
}
