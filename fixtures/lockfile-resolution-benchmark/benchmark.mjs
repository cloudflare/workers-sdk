import { spawn } from "node:child_process";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const projectPath = path.dirname(fileURLToPath(import.meta.url));
const trials = 5;
const binaries = {
	stable: path.join(projectPath, "node_modules/wrangler/bin/wrangler.js"),
	pr: path.join(projectPath, "node_modules/wrangler-pr/bin/wrangler.js"),
};

await runWrangler("stable");
await runWrangler("pr");

const results = { stable: [], pr: [] };
for (let trial = 0; trial < trials; trial++) {
	const order = trial % 2 === 0 ? ["stable", "pr"] : ["pr", "stable"];
	for (const variant of order) {
		results[variant].push(await runWrangler(variant));
	}
}

const stable = summarize(results.stable);
const pr = summarize(results.pr);
const pairedDeltas = results.pr.map(
	(duration, index) => duration - results.stable[index]
);
const delta = summarize(pairedDeltas);

console.log(`
Lockfile resolution benchmark (${trials} warmed dry-run deploys)

                  median       mean        min        max
Wrangler stable   ${format(stable.median)}   ${format(stable.mean)}   ${format(stable.min)}   ${format(stable.max)}
PR #14703         ${format(pr.median)}   ${format(pr.mean)}   ${format(pr.min)}   ${format(pr.max)}

Median paired overhead: ${format(delta.median)}
Median slowdown: ${((pr.median / stable.median - 1) * 100).toFixed(1)}%
`);

async function runWrangler(variant) {
	const startedAt = performance.now();
	await new Promise((resolve, reject) => {
		const child = spawn(
			process.execPath,
			[binaries[variant], "deploy", "--dry-run"],
			{
				cwd: projectPath,
				env: {
					...process.env,
					WRANGLER_SEND_METRICS: "false",
					WRANGLER_WRITE_LOGS: "false",
				},
				stdio: ["ignore", "pipe", "pipe"],
			}
		);

		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk) => (stdout += chunk));
		child.stderr.on("data", (chunk) => (stderr += chunk));
		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(
				new Error(
					`${variant} Wrangler failed (${signal ?? code})\n${stdout}\n${stderr}`
				)
			);
		});
	});
	return performance.now() - startedAt;
}

function summarize(values) {
	const sorted = values.toSorted((a, b) => a - b);
	return {
		min: sorted[0],
		median: sorted[Math.floor(sorted.length / 2)],
		mean: values.reduce((sum, value) => sum + value, 0) / values.length,
		max: sorted[sorted.length - 1],
	};
}

function format(milliseconds) {
	return `${milliseconds.toFixed(1).padStart(7)} ms`;
}
