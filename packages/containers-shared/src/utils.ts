import { spawn } from "child_process";

export const runDockerCmd = async (dockerPath: string, args: string[]) => {
	const child = spawn(dockerPath, args, {
		stdio: "inherit",
	}).on("error", (err) => {
		throw err;
	});

	await new Promise<void>((resolve, reject) => {
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else {
				reject(new Error(`Build exited with code: ${code}`));
			}
		});
	});
};
