import getPort from "get-port";
import { detectPackageManager } from "helpers/packageManagers";
import { retry } from "helpers/retry";
import { sleep } from "helpers/sleep";
import { fetch } from "undici";
import { expect } from "vitest";
import { isExperimental, runDeployTests } from "./constants";
import { runC3 } from "./run-c3";
import { kill, spawnWithLogging, waitForExit } from "./spawn";
import type { WorkerTestConfig } from "../tests/workers/test-config";
import type { Writable } from "stream";

const { name: pm } = detectPackageManager();

export async function runC3ForWorkerTest(
	{ argv, promptHandlers, template }: WorkerTestConfig,
	projectPath: string,
	logStream: Writable,
) {
	const args = [
		projectPath,
		"--type",
		template,
		"--experimental",
		`${isExperimental}`,
		"--no-open",
		"--no-git",
		"--deploy",
		`${runDeployTests}`,
		...(argv ?? []),
	];

	const { output } = await runC3(args, promptHandlers, logStream);
	if (!runDeployTests) {
		return null;
	}

	// Verify deployment
	const deployedUrlRe =
		/deployment is ready at: (https:\/\/.+?\.(workers)\.dev)/;

	const match = output.replaceAll("\n", "").match(deployedUrlRe);
	if (!match || !match[1]) {
		expect(false, "Couldn't find deployment url in C3 output").toBe(true);
		return;
	}

	return match[1];
}

export async function verifyDeployment(
	deploymentUrl: string,
	verifyDeploy: {
		route: string;
		expectedText: string;
	},
) {
	await retry({ times: 5 }, async () => {
		await sleep(1000);
		const res = await fetch(deploymentUrl + verifyDeploy.route);
		const body = await res.text();
		if (!body.includes(verifyDeploy.expectedText)) {
			throw new Error(
				`(Deployed page (${deploymentUrl}) didn't contain expected string: "${verifyDeploy.expectedText}" instead got ${body}`,
			);
		}
	});
}

export async function verifyLocalDev(
	{ verifyDeploy }: WorkerTestConfig,
	projectPath: string,
	logStream: Writable,
) {
	if (verifyDeploy === null) {
		return;
	}

	// Run the dev-server on random ports to avoid colliding with other tests
	const port = await getPort();
	const inspectorPort = await getPort();

	const proc = spawnWithLogging(
		[
			pm,
			"run",
			"dev",
			...(pm === "npm" ? ["--"] : []),
			"--port",
			`${port}`,
			"--inspector-port",
			`${inspectorPort}`,
		],
		{
			cwd: projectPath,
			env: {
				VITEST: undefined,
			},
		},
		logStream,
	);

	try {
		// Wait for the dev-server to be ready
		await retry(
			{ times: 20, sleepMs: 5000 },
			async () => await fetch(`http://127.0.0.1:${port}${verifyDeploy.route}`),
		);

		// Make a request to the specified test route
		const res = await fetch(`http://127.0.0.1:${port}${verifyDeploy.route}`);
		expect(await res.text()).toContain(verifyDeploy.expectedText);
	} finally {
		// Kill the process gracefully so ports can be cleaned up
		await kill(proc);
		// Wait for a second to allow process to exit cleanly. Otherwise, the port might
		// end up camped and cause future runs to fail
		await sleep(1000);
	}
}

export async function verifyTestScript(
	projectPath: string,
	logStream: Writable,
) {
	const proc = spawnWithLogging(
		[pm, "run", "test"],
		{
			cwd: projectPath,
			env: {
				VITEST: undefined,
				// We need to fake that we are inside a CI
				// so that the `vitest` commands do not go into watch mode and hang.
				CI: "true",
			},
		},
		logStream,
	);

	return await waitForExit(proc);
}
