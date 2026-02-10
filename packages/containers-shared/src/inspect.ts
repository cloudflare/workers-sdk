import { spawn } from "node:child_process";
import { UserError } from "@cloudflare/workers-utils";

export async function dockerImageInspect(
	dockerPath: string,
	options: { imageTag: string; formatString: string }
): Promise<string> {
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

		proc.stdout.on("data", (chunk) => (stdout += chunk));
		proc.stderr.on("data", (chunk) => (stderr += chunk));

		proc.on("close", (code) => {
			if (code !== 0) {
				return reject(
					new UserError(`failed inspecting image locally: ${stderr.trim()}`)
				);
			}
			resolve(stdout.trim());
		});
		proc.on("error", (err) => reject(err));
	});
}
