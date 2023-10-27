import { readFileSync, readdirSync, rmSync } from "fs";
import assert from "assert";
import { exec } from "child_process";
import { fetch } from "undici";

rmSync(".turbo/runs", { force: true, recursive: true });

const data = await fetch(
	"https://api.github.com/repos/cloudflare/workers-sdk/issues/4294",
	{
		headers: {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
	}
).then((r) => r.json());

const packageList = data.body
	.split("<!-- START-LIST -->")[1]
	.split("<!-- END-LIST -->")[0]
	.trim()
	.split("\n");

const quarantined = Object.fromEntries(
	packageList.map((p) => {
		const match = p.match(/- \[(x| )\] `([a-z0-9-@\/\.]+)`/);

		const quarantine = match[1] === "x";
		return [match[2], quarantine];
	})
);

const tests = exec("pnpm test:ci:all", { env: process.env, shell: true });
tests.stdout.pipe(process.stdout);
tests.on("exit", async () => {
	const runFile = readdirSync(".turbo/runs")[0];

	assert(!!runFile, "Summary file missing!");

	const summary = JSON.parse(readFileSync(`.turbo/runs/${runFile}`, "utf8"));
	const report = Object.fromEntries(
		summary.tasks.map((task) => [task.package, task.execution.exitCode === 0])
	);

	if (process.env.REPORT_TEST_RATE) {
		await fetch("https://pass-rate-tracker.devprod.workers.dev/submit", {
			headers: {
				"X-Submission-Token": process.env.TEST_SUBMISSION_TOKEN,
			},
			method: "POST",
			body: JSON.stringify(report),
		}).then((r) => r.json());
		console.log("Test results reported");
	}

	console.log("Test results");
	console.log(report);

	console.log("Quarantine settings");
	console.log(quarantined);

	let shouldReportSuccess = true;

	console.log("The following packages were quarantined during this run");

	for (const [p, pass] of Object.entries(report)) {
		if (quarantined[p]) {
			console.log(`- ${p} (${pass ? "PASS" : "FAIL"})`);
		}
		if (!pass && !quarantined[p]) {
			shouldReportSuccess = false;
		}
	}
	process.exit(shouldReportSuccess ? 0 : 1);
});
