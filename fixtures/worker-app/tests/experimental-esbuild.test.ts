import { resolve } from "path";
import { fetch } from "undici";
import { afterEach, describe, it } from "vitest";
import { runWranglerDev } from "../../shared/src/run-wrangler-long-lived";

describe("experimental esbuild dynamic imports", () => {
	let ip: string,
		port: number,
		stop: (() => Promise<unknown>) | undefined,
		getOutput: () => string;

	async function runWranglerDevWithExperimentalFlags(...flags: string[]) {
		({ ip, port, stop, getOutput } = await runWranglerDev(
			resolve(__dirname, ".."),
			["--port=0", "--inspector-port=0", ...flags]
		));
	}

	afterEach(async () => {
		await stop?.();
	});

	it("no --experimental-esbuild flags", async ({ expect }) => {
		await runWranglerDevWithExperimentalFlags();

		const response = await fetch(`http://${ip}:${port}/hello`);
		const text = await response.text();
		expect(text).toMatchInlineSnapshot(`"Hello World!"`);

		expect(getOutput()).not.toContain("Experimental usage of esbuild");
	});

	describe("full flag", () => {
		it("--experimental-esbuild", async ({ expect }) => {
			await runWranglerDevWithExperimentalFlags("--experimental-esbuild");

			const response = await fetch(`http://${ip}:${port}/hello`);
			const text = await response.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);

			expect(getOutput()).toContain("Experimental usage of esbuild v0.20.2");
		});

		it("--experimental-esbuild-20", async ({ expect }) => {
			await runWranglerDevWithExperimentalFlags("--experimental-esbuild-20");

			const response = await fetch(`http://${ip}:${port}/hello`);
			const text = await response.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);

			expect(getOutput()).toContain("Experimental usage of esbuild v0.20.2");
		});

		it("--experimental-esbuild-19", async ({ expect }) => {
			await runWranglerDevWithExperimentalFlags("--experimental-esbuild-19");

			const response = await fetch(`http://${ip}:${port}/hello`);
			const text = await response.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);

			expect(getOutput()).toContain("Experimental usage of esbuild v0.19.11");
		});

		it("--experimental-esbuild-18", async ({ expect }) => {
			await runWranglerDevWithExperimentalFlags("--experimental-esbuild-18");

			const response = await fetch(`http://${ip}:${port}/hello`);
			const text = await response.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);

			expect(getOutput()).toContain("Experimental usage of esbuild v0.18.20");
		});

		it("--experimental-esbuild-17", async ({ expect }) => {
			await runWranglerDevWithExperimentalFlags("--experimental-esbuild-17");

			const response = await fetch(`http://${ip}:${port}/hello`);
			const text = await response.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);

			expect(getOutput()).toContain("Experimental usage of esbuild v0.17.19");
		});
	});

	describe("shorthand flag", () => {
		it("--x-esbuild", async ({ expect }) => {
			await runWranglerDevWithExperimentalFlags("--x-esbuild");

			const response = await fetch(`http://${ip}:${port}/hello`);
			const text = await response.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);

			expect(getOutput()).toContain("Experimental usage of esbuild v0.20.2");
		});

		it("--x-esbuild-20", async ({ expect }) => {
			await runWranglerDevWithExperimentalFlags("--experimental-esbuild-20");

			const response = await fetch(`http://${ip}:${port}/hello`);
			const text = await response.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);

			expect(getOutput()).toContain("Experimental usage of esbuild v0.20.2");
		});

		it("--x-esbuild-19", async ({ expect }) => {
			await runWranglerDevWithExperimentalFlags("--experimental-esbuild-19");

			const response = await fetch(`http://${ip}:${port}/hello`);
			const text = await response.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);

			expect(getOutput()).toContain("Experimental usage of esbuild v0.19.11");
		});

		it("--x-esbuild-18", async ({ expect }) => {
			await runWranglerDevWithExperimentalFlags("--experimental-esbuild-18");

			const response = await fetch(`http://${ip}:${port}/hello`);
			const text = await response.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);

			expect(getOutput()).toContain("Experimental usage of esbuild v0.18.20");
		});

		it("--x-esbuild-17", async ({ expect }) => {
			await runWranglerDevWithExperimentalFlags("--experimental-esbuild-17");

			const response = await fetch(`http://${ip}:${port}/hello`);
			const text = await response.text();
			expect(text).toMatchInlineSnapshot(`"Hello World!"`);

			expect(getOutput()).toContain("Experimental usage of esbuild v0.17.19");
		});
	});
});
