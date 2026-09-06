import childProcess from "node:child_process";

// Global setup runs inside Node.js, not `workerd`
export default function () {
	const label = "Built auxiliary worker";
	console.time(label);
	childProcess.execSync("wrangler build -c auxiliary-worker/wrangler.jsonc", {
		cwd: __dirname,
	});
	console.timeEnd(label);
}
