import { instrument } from "@microlabs/otel-cf-workers";
import { Utils } from "discord-api-types/v10";
import dep from "ext-dep";
import { assert, describe, test } from "vitest";

describe("test", () => {
	test("resolves commonjs directory dependencies correctly", async () => {
		assert.equal(dep, 123);
	});

	// This requires the `deps.optimizer` option to be set in the vitest config
	test("resolves dependency without a default entrypoint", async () => {
		assert.isFunction(Utils.isDMInteraction);
	});

	// This requires the `deps.optimizer` option to be set in the vitest config
	test("resolves dependency with mapping on the browser field", async () => {
		assert.isFunction(instrument);
	});
});
