import { spawn } from "node:child_process";
import path from "node:path";

export async function checkTypes(tsconfig: string) {
	const tsPath = path.resolve(require.resolve("typescript"), "../../bin/tsc");

	spawn(tsPath, ["--project", tsconfig], {
		stdio: "inherit",
	}).on("exit", (code) =>
		process.exit(code === undefined || code === null ? 0 : code)
	);
}
