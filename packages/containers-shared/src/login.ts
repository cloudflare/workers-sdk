import { spawn } from "node:child_process";
import { UserError } from "@cloudflare/workers-utils/errors";
import { ImageRegistryPermissions } from "./client";
import { fetchResult } from "./context";
import type {
	AccountRegistryToken,
	ImageRegistryCredentialsConfiguration,
} from "./client";
import type { ComplianceConfig } from "@cloudflare/workers-utils";

/**
 * Gets push and pull credentials for a configured image registry
 * and runs `docker login`, so subsequent image pushes or pulls are
 * authenticated
 */
export async function dockerLoginImageRegistry(
	pathToDocker: string,
	domain: string,
	accountId: string,
	complianceConfig?: ComplianceConfig
): Promise<void> {
	const credentials = await fetchResult<AccountRegistryToken>(
		complianceConfig ?? {},
		`/accounts/${accountId}/containers/registries/${domain}/credentials`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({
				// How long the credentials should be valid for.
				expiration_minutes: 15,
				permissions: [
					ImageRegistryPermissions.PUSH,
					ImageRegistryPermissions.PULL,
				],
			} satisfies ImageRegistryCredentialsConfiguration),
		}
	);

	if (credentials.password === undefined) {
		throw new Error("Expected registry credentials to include a password");
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
