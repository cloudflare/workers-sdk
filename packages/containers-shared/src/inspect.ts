import { spawn } from "node:child_process";
import { UserError } from "@cloudflare/workers-utils";

const MAX_INSPECT_RETRIES = 5;
const RETRY_DELAY_MS = 100;

type InspectError = Error & {
	stderr: string;
	transientMissingImage: boolean;
};

const isTransientMissingImage = (stderr: string): boolean => {
	const message = stderr.toLowerCase();
	return (
		message.includes("no such image") ||
		message.includes("failed to find image")
	);
};

const createInspectError = (stderr: string): InspectError => {
	const error = new UserError(
		`failed inspecting image locally: ${stderr.trim()}`
	);
	return Object.assign(error, {
		stderr: stderr.trim(),
		transientMissingImage: isTransientMissingImage(stderr),
	});
};

const createSpawnError = (error: Error): InspectError => {
	return Object.assign(error, {
		stderr: "",
		transientMissingImage: false,
	});
};

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

const inspectOnce = async (
	dockerPath: string,
	options: { imageTag: string; formatString: string }
): Promise<string> => {
	return new Promise((resolve, reject) => {
		const proc = spawn(
			dockerPath,
			["image", "inspect", options.imageTag, "--format", options.formatString],
			{
				stdio: ["ignore", "pipe", "pipe"],
			}
		);

		let stdout = "";
		let stderr = "";

		proc.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		proc.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});

		proc.on("close", (code) => {
			if (code !== 0) {
				return reject(createInspectError(stderr));
			}
			resolve(stdout.trim());
		});
		proc.on("error", (error) => reject(createSpawnError(error)));
	});
};

const isRetryableInspectError = (error: unknown): error is InspectError => {
	return (
		error instanceof Error &&
		"transientMissingImage" in error &&
		error.transientMissingImage === true
	);
};

export async function dockerImageInspect(
	dockerPath: string,
	options: { imageTag: string; formatString: string }
): Promise<string> {
	let attempt = 0;

	while (true) {
		attempt++;

		try {
			return await inspectOnce(dockerPath, options);
		} catch (error) {
			if (!isRetryableInspectError(error) || attempt === MAX_INSPECT_RETRIES) {
				throw error;
			}

			await sleep(RETRY_DELAY_MS);
		}
	}
}
