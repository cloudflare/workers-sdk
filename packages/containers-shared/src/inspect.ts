import { spawn } from "child_process";

// TODO: generalise
export async function dockerImageInspect(
	dockerPath: string,
	image: string
): Promise<{ size: number; layers: number }> {
	return new Promise((resolve, reject) => {
		const proc = spawn(
			dockerPath,
			[
				"image",
				"inspect",
				image,
				"--format",
				"{{ .Size }} {{ len .RootFS.Layers }}",
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
					new Error(`failed inspecting image locally: ${stderr.trim()}`)
				);
			}
			const [sizeStr, layerStr] = stdout.trim().split(" ");
			resolve({ size: parseInt(sizeStr, 10), layers: parseInt(layerStr, 10) });
		});

		proc.on("error", (err) => reject(err));
	});
}
