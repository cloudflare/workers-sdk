import { instrument } from "@microlabs/otel-cf-workers";
import { SELF } from "cloudflare:test";
import { Utils } from "discord-api-types/v10";
import dep from "ext-dep";
import { assert, describe, expect, test } from "vitest";
import worker from "../src/index";

describe("test", () => {
	test("resolves commonjs directory dependencies correctly", async () => {
		assert.equal(dep, 123);
	});

	test("resolves dependency without a default entrypoint", async () => {
		assert.isFunction(Utils.isDMInteraction);
	});

	test("resolves dependency with mapping on the browser field", async () => {
		assert.isFunction(instrument);
	});

	test("can use toucan-js (integration)", async () => {
		expect((await SELF.fetch("http://example.com")).status).toBe(200);
	});

	test("can use toucan-js (unit)", async () => {
		const response = await worker.fetch();
		expect(response.status).toBe(200);
	});
});
