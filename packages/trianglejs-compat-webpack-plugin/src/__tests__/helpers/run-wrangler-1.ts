import { Writable as WritableStream } from "node:stream";
import { execaCommand } from "execa";
import { PATH_TO_WRANGLER } from "./constants";
import { pipe, cleanMessage } from "./pipe";
import type { ExecaError } from "execa";

export async function runWrangler1(command?: string) {
	// wranglerjs is installed the _first_ time you run this, but not after.
	// For consistency we omit the "⬇️   Installing wranglerjs v1.19.11..."
	// and following `npm install`, and re-enable printing by looking for the
	// messages about vulnerabilities and auditing etc.
	// this is so horrible.
	let shouldPrint = true;

	const stdout = new WritableStream({
		write: pipe((message) => {
			if (message.includes("Installing wranglerjs")) {
				shouldPrint = false;
			}
			if (shouldPrint) {
				console.log(message);
			}
			if (message.includes("Run `npm audit` for details.")) {
				shouldPrint = true;
			}
		}),
	});
	const stderr = new WritableStream({
		write: pipe((message) => {
			if (shouldPrint) {
				message.startsWith("Warning:")
					? console.warn(message)
					: console.error(message);
			}
			if (message.includes("vulnerabilities")) {
				shouldPrint = true;
			}
		}),
	});

	const process = execaCommand(`${PATH_TO_WRANGLER} ${command}`);

	process.stdout?.pipe(stdout);
	process.stderr?.pipe(stderr);

	try {
		return await process;
	} catch (e) {
		const error = e as ExecaError<string>;
		error.message = cleanMessage(error.message);
		throw error;
	}
}
