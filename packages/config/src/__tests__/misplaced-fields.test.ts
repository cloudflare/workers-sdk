import { describe, it } from "vitest";
import * as z from "zod";
import { CloudflareConfigSchema, WorkerConfigSchema } from "../schema";

const worker = {
	name: "test",
	compatibilityDate: "2026-11-23",
};

describe("misplaced config fields", () => {
	it.for(Object.keys(CloudflareConfigSchema.shape))(
		"explains that worker.%s belongs at the top level",
		(key, { expect }) => {
			const result = CloudflareConfigSchema.safeParse({
				worker: { ...worker, [key]: key === "worker" ? worker : "misplaced" },
			});

			expect(result.success).toBe(false);
			expect(result.error?.issues).toEqual([
				{
					code: "unrecognized_keys",
					keys: [key],
					path: ["worker"],
					message: `Unrecognized key: "${key}". "${key}" belongs at the top level of the config, outside "worker".`,
				},
			]);
		}
	);

	it.for(Object.keys(CloudflareConfigSchema.shape))(
		"does not suggest the project root for standalone Worker field %s",
		(key, { expect }) => {
			const result = WorkerConfigSchema.safeParse({
				...worker,
				[key]: key === "worker" ? worker : "misplaced",
			});

			expect(result.success).toBe(false);
			expect(result.error?.issues).toEqual([
				{
					code: "unrecognized_keys",
					keys: [key],
					path: [],
					message: `Unrecognized key: "${key}"`,
				},
			]);
		}
	);

	it.for(Object.keys(WorkerConfigSchema.shape))(
		"explains that top-level %s belongs inside worker",
		(key, { expect }) => {
			const result = CloudflareConfigSchema.safeParse({ [key]: "misplaced" });

			expect(result.success).toBe(false);
			expect(result.error?.issues).toEqual([
				{
					code: "unrecognized_keys",
					keys: [key],
					path: [],
					message: `Unrecognized key: "${key}". "${key}" belongs inside "worker".`,
				},
			]);
		}
	);

	it("reports multiple misplaced fields alongside unknown fields", ({
		expect,
	}) => {
		const result = CloudflareConfigSchema.safeParse({
			worker: {
				...worker,
				accountId: "xyz",
				complianceRegion: "public",
				unknownSetting: true,
			},
		});

		expect(result.success).toBe(false);
		expect(result.error && z.prettifyError(result.error)).toBe(
			'✖ Unrecognized keys: "accountId", "complianceRegion", "unknownSetting". "accountId" belongs at the top level of the config, outside "worker". "complianceRegion" belongs at the top level of the config, outside "worker".\n  → at worker'
		);
	});

	it("does not suggest the top level for an unknown field under worker", ({
		expect,
	}) => {
		const result = CloudflareConfigSchema.safeParse({
			worker: { ...worker, unknownSetting: true },
		});

		expect(result.success).toBe(false);
		expect(result.error && z.prettifyError(result.error)).toBe(
			'✖ Unrecognized key: "unknownSetting"\n  → at worker'
		);
	});

	it.for([
		{ unknownSetting: true },
		{ worker: { ...worker, assets: { accountId: "xyz" } } },
	])("preserves unknown-key errors elsewhere: %j", (config, { expect }) => {
		const result = CloudflareConfigSchema.safeParse(config);

		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toMatch(
			/^Unrecognized key: "(?:unknownSetting|accountId)"$/
		);
	});
});
