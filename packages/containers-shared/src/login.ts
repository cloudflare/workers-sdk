import { spawn } from "node:child_process";
import { UserError } from "@cloudflare/workers-utils/errors";
import { ImageRegistriesService, ImageRegistryPermissions } from "./client";
import { OpenAPI } from "./client/core/OpenAPI";
import {
	createBoundedOutputCollector,
	withDockerDebugHint,
} from "./process-output";

export function configureOpenAPIForContainerPull(
	accountId: string,
	apiToken: string,
	apiBase = "https://api.cloudflare.com/client/v4"
): void {
	OpenAPI.BASE = `${apiBase}/accounts/${accountId}/containers`;
	OpenAPI.CREDENTIALS = "omit";
	const existingHeaders =
		typeof OpenAPI.HEADERS === "object" ? OpenAPI.HEADERS : {};
	OpenAPI.HEADERS = {
		...existingHeaders,
		Authorization: `Bearer ${apiToken}`,
	};
}

/**
 * Gets push and pull credentials for a configured image registry
 * and runs `docker login`, so subsequent image pushes or pulls are
 * authenticated
 *
 * @param outputMode - Capture output for concise callers, or inherit it for development and debug workflows.
 */
export async function dockerLoginImageRegistry(
	pathToDocker: string,
	domain: string,
	outputMode: "capture" | "inherit" = "inherit"
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
		{
			stdio:
				outputMode === "capture"
					? ["pipe", "pipe", "pipe"]
					: ["pipe", "inherit", "inherit"],
		}
	);
	const capturedOutput = createBoundedOutputCollector();
	child.stdout?.on("data", capturedOutput.append);
	child.stderr?.on("data", capturedOutput.append);

	const login = new Promise<void>((resolve, reject) => {
		let settled = false;
		child.on("error", (error) => {
			if (settled) {
				return;
			}
			settled = true;
			const message = `Docker login failed: ${error.message}`;
			reject(
				new UserError(
					outputMode === "capture" ? withDockerDebugHint(message) : message,
					{
						telemetryMessage: false,
					}
				)
			);
		});
		child.on("close", (code) => {
			if (settled) {
				return;
			}
			settled = true;
			if (code === 0) {
				resolve();
			} else {
				const details = capturedOutput.read();
				const message = details
					? `Docker login failed with exit code ${code}:\n${details}`
					: `Docker login failed with exit code: ${code}`;
				reject(
					new UserError(
						outputMode === "capture" ? withDockerDebugHint(message) : message,
						{ telemetryMessage: false }
					)
				);
			}
		});
	});

	child.stdin?.end(credentials.password);
	await login;
}
