import childProcess from "node:child_process";
import events from "node:events";
import { createRequire } from "node:module";

// Global setup runs inside Node.js, not `workerd`
export default async function () {
	console.log(
		"Building pages-functions-unit-integration-self and watching for changes..."
	);

	// Not building to `dist` here as Vitest ignores changes in `dist` by default
	// Launch the CLI directly so teardown owns the watcher process on Windows.
	const buildProcess = childProcess.spawn(
		process.execPath,
		[
			createRequire(import.meta.url).resolve("wrangler"),
			"pages",
			"functions",
			"build",
			"--outdir",
			"dist-functions",
			"--watch",
		],
		{ cwd: __dirname }
	);
	const closePromise = events.once(buildProcess, "close");
	buildProcess.stdout.pipe(process.stdout);
	buildProcess.stderr.pipe(process.stderr);

	// Wait for first build
	await events.once(buildProcess.stdout, "data");

	// Stop watching for changes on teardown
	return async () => {
		buildProcess.kill();
		await closePromise;
	};
}
