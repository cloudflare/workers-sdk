import childProcess from "node:child_process";
import events from "node:events";

// Global setup runs inside Node.js, not `workerd`
export default async function () {
	console.log(
		"Building pages-functions-unit-integration-self and watching for changes..."
	);

	// Not building to `dist` here as Vitest ignores changes in `dist` by default
	const buildProcess = childProcess.spawn(
		"wrangler pages functions build --outdir dist-functions --watch",
		{ cwd: __dirname, shell: true }
	);
	buildProcess.stdout.pipe(process.stdout);
	buildProcess.stderr.pipe(process.stderr);

	// Wait for first build
	await events.once(buildProcess.stdout, "data");

	// Stop watching for changes on teardown
	return () => {
		buildProcess.kill();
	};
}
