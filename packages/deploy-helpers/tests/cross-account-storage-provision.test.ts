import { normalizeAndValidateConfig } from "@cloudflare/workers-utils";
import { test, vi } from "vitest";
import { provisionBindings } from "../src/deploy/helpers/provision-bindings";
import type { StartDevWorkerInput } from "@cloudflare/workers-utils";

const mocks = vi.hoisted(() => ({
	fetchResult: vi.fn(),
	fetchListResult: vi.fn(),
}));
vi.mock("../src/shared/context", () => ({
	fetchResult: mocks.fetchResult,
	fetchListResult: mocks.fetchListResult,
	logger: { debug: vi.fn(), log: vi.fn() },
}));

const source = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const target = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const resources = [
	{ type: "d1", database_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" },
	{ type: "kv_namespace", id: "cccccccccccccccccccccccccccccccc" },
	{ type: "r2_bucket", bucket_name: "existing" },
] as const;

test.for(resources)(
	"never provisions $type under the source account",
	async (binding, { expect }) => {
		mocks.fetchResult.mockResolvedValue({ bindings: [] });
		const { config } = normalizeAndValidateConfig({}, undefined, undefined, {});
		const bindings = { DATA: { ...binding, target_account_id: target } };
		await provisionBindings(bindings, source, "source", true, config, {
			d1ListCommand: "cf d1 list",
			d1DeleteCommand: "cf d1 delete",
		});
		expect(mocks.fetchResult.mock.calls).toEqual([
			[config, `/accounts/${source}/workers/scripts/source/settings`],
		]);
		expect(mocks.fetchListResult).not.toHaveBeenCalled();
		expect(bindings.DATA).toEqual({ ...binding, target_account_id: target });
	}
);

test.for(resources)(
	"requires an existing $type identifier",
	async ({ type }, { expect }) => {
		mocks.fetchResult.mockResolvedValue({ bindings: [] });
		const { config } = normalizeAndValidateConfig({}, undefined, undefined, {});
		const bindings = {
			DATA: { type, target_account_id: target },
		} as StartDevWorkerInput["bindings"];
		await expect(
			provisionBindings(bindings, source, "source", true, config, {
				d1ListCommand: "cf d1 list",
				d1DeleteCommand: "cf d1 delete",
			})
		).rejects.toThrow("requires an existing resource ID");
		expect(mocks.fetchResult).toHaveBeenCalledTimes(1);
		expect(mocks.fetchListResult).not.toHaveBeenCalled();
	}
);
