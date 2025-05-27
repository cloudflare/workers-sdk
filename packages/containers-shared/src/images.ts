import { spawn } from "child_process";

export async function tagImage(
	original: string,
	newTag: string,
	dockerPath: string
) {
	const child = spawn(dockerPath, ["tag", original, newTag]).on(
		"error",
		(err) => {
			throw err;
		}
	);
	await new Promise((resolve) => {
		child.on("close", resolve);
	});
}
