import { spawn } from "node:child_process";
import { UserError } from "@cloudflare/workers-utils";

const MAX_INSPECT_RETRIES = 5;
const RETRY_DELAY_MS = 100;

const isTransientMissingImage = (stderr: string): boolean => {
	const message = stderr.toLowerCase();
	return (
		message.includes("no such image") ||
		message.includes("failed to find image")
	);
};

const createInspectError = (stderr: string): UserError => {
	const error = new UserError(
		`failed inspecting image locally: ${stderr.trim()}`
	);
	return Object.assign(error, {
		stderr: stderr.trim(),
		transientMissingImage: isTransientMissingImage(stderr),
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
		proc.on("error", (err) => reject(err));
	});
};

export async function dockerImageInspect(
	dockerPath: string,
	options: { imageTag: string; formatString: string }
): Promise<string> {
	let lastError: unknown;

	for (let attempt = 1; attempt <= MAX_INSPECT_RETRIES; attempt++) {
		try {
			return await inspectOnce(dockerPath, options);
		} catch (error) {
			lastError = error;
			const isRetryable =
				error instanceof Error &&
				"transientMissingImage" in error &&
				(Boolean((error as { transientMissingImage?: boolean }).transientMissingImage));

			if (!isRetryable || attempt === MAX_INSPECT_RETRIES) {
				throw error;
			}

			await sleep(RETRY_DELAY_MS);
		}
	}

	throw lastError;
}
