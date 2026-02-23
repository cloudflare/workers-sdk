import { spawn } from "node:child_process";
import { UserError } from "@cloudflare/workers-utils";

export async function dockerImageInspect(
	dockerPath: string,
	options: { imageTag: string; formatString: string }
): Promise<string> {
	const sleep = (ms: number) =>
		new Promise((resolve) => setTimeout(resolve, ms));

	const isTransientMissingImage = (stderr: string): boolean => {
		const message = stderr.toLowerCase();
		return (
			message.includes("no such image") ||
			message.includes("failed to find image")
		);
	};

	const inspectOnce = async (): Promise<string> => {
		return new Promise((resolve, reject) => {
			const proc = spawn(
				dockerPath,
				[
					"image",
					"inspect",
					options.imageTag,
					"--format",
					options.formatString,
				],
				{
					stdio: ["ignore", "pipe", "pipe"],
				}
			);

			let stdout = "";
			let stderr = "";

			proc.stdout.on("data", (chunk) => (stdout += chunk));
			proc.stderr.on("data", (chunk) => (stderr += chunk));

			proc.on("close", (code) => {
				if (code !== 0) {
					return reject(
						Object.assign(
							new UserError(
								`failed inspecting image locally: ${stderr.trim()}`
							),
							{ __stderr: stderr }
						)
					);
				}
				resolve(stdout.trim());
			});
			proc.on("error", (err) => reject(err));
		});
	};

	// `docker build --load` / `docker tag` can be briefly inconsistent in local dev,
	// especially when Wrangler uses buildx under the hood. Retry a handful of times
	// only for missing-image errors.
	const maxAttempts = 5;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await inspectOnce();
		} catch (err) {
			const stderr = (err as { __stderr?: string } | undefined)?.__stderr;
			if (
				attempt < maxAttempts &&
				typeof stderr === "string" &&
				isTransientMissingImage(stderr)
			) {
				await sleep(200);
				continue;
			}
			throw err;
		}
	}

	// Unreachable, but keeps TypeScript happy.
	throw new UserError("failed inspecting image locally: unknown error");
}
