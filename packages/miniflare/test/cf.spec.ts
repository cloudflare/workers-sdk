import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, test } from "vitest";
import { useDispose } from "./test-shared";

describe("CLOUDFLARE_CF_FETCH_ENABLED environment variable", () => {
	let originalEnabledEnv: string | undefined;
	let originalPathEnv: string | undefined;

	beforeEach(() => {
		originalEnabledEnv = process.env.CLOUDFLARE_CF_FETCH_ENABLED;
		originalPathEnv = process.env.CLOUDFLARE_CF_FETCH_PATH;
	});

	afterEach(() => {
		if (originalEnabledEnv === undefined) {
			delete process.env.CLOUDFLARE_CF_FETCH_ENABLED;
		} else {
			process.env.CLOUDFLARE_CF_FETCH_ENABLED = originalEnabledEnv;
		}
		if (originalPathEnv === undefined) {
			delete process.env.CLOUDFLARE_CF_FETCH_PATH;
		} else {
			process.env.CLOUDFLARE_CF_FETCH_PATH = originalPathEnv;
		}
	});

	test("CLOUDFLARE_CF_FETCH_ENABLED=false disables cf fetching", async ({
		expect,
	}) => {
		process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";

		const mf = new Miniflare({
			script: "",
			modules: true,
		});
		useDispose(mf);

		const cf = await mf.getCf();
		// Should return fallback cf object when fetching is disabled
		expect(cf).toMatchObject({
			colo: "DFW",
			country: "US",
		});
	});

	test("CLOUDFLARE_CF_FETCH_ENABLED=FALSE (uppercase) disables cf fetching", async ({
		expect,
	}) => {
		process.env.CLOUDFLARE_CF_FETCH_ENABLED = "FALSE";

		const mf = new Miniflare({
			script: "",
			modules: true,
		});
		useDispose(mf);

		const cf = await mf.getCf();
		// Should return fallback cf object when fetching is disabled
		expect(cf).toMatchObject({
			colo: "DFW",
			country: "US",
		});
	});

	test("explicit cf option takes precedence over CLOUDFLARE_CF_FETCH_ENABLED", async ({
		expect,
	}) => {
		process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";

		const mf = new Miniflare({
			script: "",
			modules: true,
			cf: { colo: "CUSTOM", country: "GB" },
		});
		useDispose(mf);

		const cf = await mf.getCf();
		// Explicit cf option should take precedence
		expect(cf).toEqual({ colo: "CUSTOM", country: "GB" });
	});

	test("explicit cf option takes precedence over CLOUDFLARE_CF_FETCH_PATH", async ({
		expect,
	}) => {
		process.env.CLOUDFLARE_CF_FETCH_PATH = "/some/custom/path.json";

		const mf = new Miniflare({
			script: "",
			modules: true,
			cf: { colo: "CUSTOM", country: "GB" },
		});
		useDispose(mf);

		const cf = await mf.getCf();
		// Explicit cf option should take precedence
		expect(cf).toEqual({ colo: "CUSTOM", country: "GB" });
	});

	test("CLOUDFLARE_CF_FETCH_ENABLED takes precedence over CLOUDFLARE_CF_FETCH_PATH when disabled", async ({
		expect,
	}) => {
		process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
		process.env.CLOUDFLARE_CF_FETCH_PATH = "/some/custom/path.json";

		const mf = new Miniflare({
			script: "",
			modules: true,
		});
		useDispose(mf);

		const cf = await mf.getCf();
		// Should return fallback cf object when fetching is disabled, ignoring the path
		expect(cf).toMatchObject({
			colo: "DFW",
			country: "US",
		});
	});

	test("empty CLOUDFLARE_CF_FETCH_PATH uses default path", async ({
		expect,
	}) => {
		// Setting to empty string should be treated as unset (use default behavior)
		process.env.CLOUDFLARE_CF_FETCH_PATH = "";

		const mf = new Miniflare({
			script: "",
			modules: true,
		});
		useDispose(mf);

		const cf = await mf.getCf();
		// Should return fallback cf object (default test behavior)
		// This verifies empty string doesn't cause issues and uses default path
		expect(cf).toMatchObject({
			colo: "DFW",
			country: "US",
		});
	});
});
