import { spawn } from "child_process";

/** helper for simple docker command call that don't require any io handling */
export const runDockerCmd = async (dockerPath: string, args: string[]) => {
	const child = spawn(dockerPath, args, {
		stdio: "inherit",
	});
	let errorHandled = false;
	await new Promise<void>((resolve, reject) => {
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
			} else if (!errorHandled) {
				errorHandled = true;
				reject(new Error(`Docker command exited with code: ${code}`));
			}
		});
		child.on("error", (err) => {
			if (!errorHandled) {
				errorHandled = true;
				reject(new Error(`Docker command failed: ${err.message}`));
			}
		});
	});
};
