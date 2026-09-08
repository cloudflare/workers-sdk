import { spawn } from "node:child_process";
import { UserError } from "@cloudflare/workers-utils/errors";
import { fetchResult, getRegistryCredentialsResource } from "./context";
import type { ComplianceConfig } from "@cloudflare/workers-utils/compliance";

type AccountRegistryToken = {
	username: string;
	password?: string;
};

/**
 * Gets push and pull credentials for a configured image registry
 * and runs `docker login`, so subsequent image pushes or pulls are
 * authenticated
 */
export async function dockerLoginImageRegistry(
	pathToDocker: string,
	domain: string,
	complianceConfig: ComplianceConfig
) {
	// how long the credentials should be valid for
	const expirationMinutes = 15;

	const credentials = await fetchResult<AccountRegistryToken>(
		complianceConfig,
		getRegistryCredentialsResource(domain),
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				expiration_minutes: expirationMinutes,
				permissions: ["push", "pull"],
			}),
		}
	);

	if (credentials.password === undefined) {
		throw new UserError("Unable to retrieve registry credentials.", {
			telemetryMessage: false,
		});
	}

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
				reject(
					new UserError(`Login failed with code: ${code}`, {
						telemetryMessage: false,
					})
				);
			}
		});
	});
}
