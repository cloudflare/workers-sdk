import { mkdtemp } from "fs/promises";
import { cp, cpSync, writeFile } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "os";
import path from "path";
import dedent from "ts-dedent";
import { afterAll, beforeAll, describe, it, vi } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

export async function getTmpDir(prefix: string) {
	return mkdtemp(path.join(tmpdir(), prefix));
}

// TODO: we'll want to run this on all OSes but that will require some setup because docker is not installed by default on macos and windows
describe.skipIf(process.platform !== "linux")("Containers local dev", () => {
	// let tmpDir: string;
	// // const tmp = getTmpDir("wrangler-containers-");
	// beforeAll(async () => {
	// 	// ({ stop, getOutput } = await runWranglerDev(resolve(__dirname, ".."), [
	// 	// 	"--port=0",
	// 	// 	"--inspector-port=0",
	// 	// ]));
	// 	// tmpDir = await getTmpDir("wrangler-containers-");
	// 	// cpSync(path.resolve(__dirname, "..", "src"), path.join(tmpDir, "src"), {
	// 	// 	recursive: true,
	// 	// });
	// 	// cpSync(
	// 	// 	path.resolve(__dirname, "..", "wrangler.jsonc"),
	// 	// 	path.join(tmpDir, "wrangler.jsonc")
	// 	// );
	// });

	// afterAll(async () => {
	// 	await stop?.();
	// });

	it("starts up container service if containers are in config", async ({
		expect,
	}) => {
		expect(getOutput()).toContain(dedent`
			Hello from ContainerService!
			Container Options: {
			  "Container": {
			    "image": "./Dockerfile",
			    "maxInstances": 2
			  }
			}
		`);
	});

	it("doesn't start up container service if no containers are present", async ({
		expect,
	}) => {
		await stop?.();
		({ stop, getOutput } = await runWranglerDev(resolve(__dirname, ".."), [
			"--port=0",
			"--inspector-port=0",
		]);
		const output = getOutput();
		console.dir(output);
		expect(output).toContain("Hello from ContainerService!");

		await stop?.();
	});

	// it("doesn't start up container service if no containers are present", async ({
	// 	expect,
	// }) => {
	// 	const { stop, getOutput } = await runWranglerDev(resolve(__dirname, ".."), [
	// 		"--port=0",
	// 		"--inspector-port=0",
	// 		"-c=wrangler.no-containers.jsonc",
	// 	]);
	// 	expect(getOutput()).not.toContain(`Hello from ContainerService!`);
	// 	expect(getOutput()).toContain("Ready on");
	// 	await stop?.();
	// });

	// it("doesn't start up container service if ignore_containers is set via CLI", async ({
	// 	expect,
	// }) => {
	// 	const { stop, getOutput } = await runWranglerDev(resolve(__dirname, ".."), [
	// 		"--port=0",
	// 		"--inspector-port=0",
	// 		"--ignore-containers",
	// 	]);
	// 	expect(getOutput()).not.toContain(`Hello from ContainerService!`);
	// 	await stop?.();
	// });

	// it("doesn't start up container service if ignore_containers is set via config", async ({
	// 	expect,
	// }) => {
	// 	const { stop, getOutput } = await runWranglerDev(resolve(__dirname, ".."), [
	// 		"--port=0",
	// 		"--inspector-port=0",
	// 		"-c=wrangler.ignore-containers.jsonc",
	// 	]);
	// 	expect(getOutput()).not.toContain(`Hello from ContainerService!`);
	// 	await stop?.();
	// });
});
