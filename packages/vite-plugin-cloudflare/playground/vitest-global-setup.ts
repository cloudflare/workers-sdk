import { isDockerRunning } from "@cloudflare/containers-shared";
import { chromium } from "playwright-chromium";
import { version } from "vite";
import { getDockerPath } from "../src/containers";
import type { BrowserServer } from "playwright-chromium";
import type { TestProject } from "vitest/node";

let browserServer: BrowserServer | undefined;

export async function setup({ provide }: TestProject): Promise<void> {
	process.env.NODE_ENV = process.env.VITE_TEST_BUILD
		? "production"
		: "development";

	browserServer = await chromium.launchServer({
		headless: !process.env.VITE_DEBUG_SERVE,
		args: process.env.CI
			? ["--no-sandbox", "--disable-setuid-sandbox"]
			: undefined,
	});

	provide("wsEndpoint", browserServer.wsEndpoint());
}

const expectedViteMajor = process.env.VITE_VERSION?.replace(/^vite-/, "");
if (expectedViteMajor && !version.startsWith(`${expectedViteMajor}.`)) {
	throw new Error(
		`Expected Vite ${expectedViteMajor}, but the playground test harness loaded Vite ${version}. Check that the workspace uses the same Vite version.`
	);
}

console.log(`Testing with Vite ${version}`);

const dockerIsRunning = await isDockerRunning(getDockerPath());

/** Indicates whether the test is being run locally (not in CI) AND docker is currently not running on the system */
const isLocalWithoutDockerRunning =
	process.env.CI !== "true" && !dockerIsRunning;

if (isLocalWithoutDockerRunning) {
	process.env.LOCAL_TESTS_WITHOUT_DOCKER = "true";
}

if (isLocalWithoutDockerRunning) {
	console.warn(
		"The tests are running locally but there is no docker instance running on the system, skipping containers tests\n"
	);
}

export async function teardown(): Promise<void> {
	await browserServer?.close();
}
