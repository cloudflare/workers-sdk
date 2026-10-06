import childProcess from "node:child_process";

// Global setup runs inside Node.js, not `workerd`
export default function () {
	const label = "Built basics-integration-auxiliary worker";
	console.time(label);
	childProcess.execSync("wrangler build", { cwd: __dirname });
	console.timeEnd(label);
}
