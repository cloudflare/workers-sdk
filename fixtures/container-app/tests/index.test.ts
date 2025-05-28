import { resolve } from "node:path";
import dedent from "ts-dedent";
import { afterAll, beforeAll, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("Containers local dev", () => {
	let stop: (() => Promise<unknown>) | undefined, getOutput: () => string;

	beforeAll(async () => {
		({ stop, getOutput } = await runWranglerDev(resolve(__dirname, ".."), [
			"--port=0",
			"--inspector-port=0",
		]));
	});

	afterAll(async () => {
		await stop?.();
	});

	it("starts up container service if containers are in config", async ({
		expect,
	}) => {
		expect(getOutput()).toContain(dedent`
			Your Worker has access to the following bindings:
			Binding                        Resource            Mode
			env.CONTAINER (Container)      Durable Object      local

			⎔ Starting local server...
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
			"-c=wrangler.no-containers.jsonc",
		]));
		expect(getOutput()).not.toContain(`Hello from ContainerService!`);
		expect(getOutput()).toContain("Ready on");
	});
});
