import { spawn } from "node:child_process";
import { ImageRegistriesService, ImageRegistryPermissions } from "./client";
import { DOMAIN } from "./constants";

export async function dockerLoginManagedRegistry(pathToDocker: string) {
	const dockerPath = pathToDocker;
	const expirationMinutes = 15;

	await ImageRegistriesService.generateImageRegistryCredentials(DOMAIN, {
		expiration_minutes: expirationMinutes,
		permissions: ["push"] as ImageRegistryPermissions[],
	}).then(async (credentials) => {
		const child = spawn(
			dockerPath,
			["login", "--password-stdin", "--username", "v1", DOMAIN],
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
