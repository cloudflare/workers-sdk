import { spawn } from "node:child_process";
import { UserError } from "@cloudflare/workers-utils/errors";
import { getDockerCommandArgs } from "./docker-command";

export async function dockerImageInspect(
	dockerPath: string,
	options: { imageTag: string; formatString: string },
	dockerHost?: string
): Promise<string> {
	return new Promise((resolve, reject) => {
		const proc = spawn(
			dockerPath,
			getDockerCommandArgs(
				[
					"image",
					"inspect",
					options.imageTag,
					"--format",
					options.formatString,
				],
				dockerHost
			),
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
					new UserError(`failed inspecting image locally: ${stderr.trim()}`, {
						telemetryMessage: false,
					})
				);
			}
			resolve(stdout.trim());
		});
		proc.on("error", (err) => reject(err));
	});
}
