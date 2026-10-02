import { describe, it } from "vitest";
import { convertWranglerConfig } from "../src/codemods/wrangler-to-cf/config-converter";
import { renderCloudflareConfig } from "../src/codemods/wrangler-to-cf/config-renderer";
import { inferDurableObjectExports } from "../src/codemods/wrangler-to-cf/durable-object-exports";
import type { MigrationFollowUp } from "../src/codemods/wrangler-to-cf/types";

function infer(source: Record<string, unknown>, sourcePrefix = "") {
	const followUps: MigrationFollowUp[] = [];
	const exports = inferDurableObjectExports(source, sourcePrefix, (followUp) =>
		followUps.push(followUp)
	);
	return { exports, followUps };
}

describe("Durable Object export inference", () => {
	it("infers storage for bound and unbound classes", ({ expect }) => {
		const result = infer({
			durable_objects: {
				bindings: [{ class_name: "Counter", name: "COUNTER" }],
			},
			migrations: [
				{ new_classes: ["Legacy"], tag: "v1" },
				{ new_sqlite_classes: ["Counter", "Unbound"], tag: "v2" },
			],
			name: "worker",
		});

		expect(result).toEqual({
			exports: {
				Counter: { storage: "sqlite", type: "durable-object" },
				Legacy: { storage: "legacy-kv", type: "durable-object" },
				Unbound: { storage: "sqlite", type: "durable-object" },
			},
			followUps: [],
		});
	});

	it("preserves storage and collapses rename chains to the live class", ({
		expect,
	}) => {
		const result = infer({
			migrations: [
				{ new_classes: ["Old"], tag: "v1" },
				{ renamed_classes: [{ from: "Old", to: "Middle" }], tag: "v2" },
				{ renamed_classes: [{ from: "Middle", to: "Current" }], tag: "v3" },
			],
		});

		expect(result).toEqual({
			exports: {
				Current: { storage: "legacy-kv", type: "durable-object" },
				Middle: {
					renamed_to: "Current",
					state: "renamed",
					type: "durable-object",
				},
				Old: {
					renamed_to: "Current",
					state: "renamed",
					type: "durable-object",
				},
			},
			followUps: [],
		});
	});

	it("retires a deleted class and its previous names", ({ expect }) => {
		const result = infer({
			migrations: [
				{ new_sqlite_classes: ["Old"], tag: "v1" },
				{ renamed_classes: [{ from: "Old", to: "Current" }], tag: "v2" },
				{ deleted_classes: ["Current", "AlreadyGone"], tag: "v3" },
			],
		});

		expect(result).toEqual({
			exports: {
				AlreadyGone: { state: "deleted", type: "durable-object" },
				Current: { state: "deleted", type: "durable-object" },
				Old: { state: "deleted", type: "durable-object" },
			},
			followUps: [],
		});
	});

	it("uses a recreated class's latest storage", ({ expect }) => {
		const result = infer({
			migrations: [
				{ new_classes: ["Counter"], tag: "v1" },
				{ deleted_classes: ["Counter"], tag: "v2" },
				{ new_sqlite_classes: ["Counter"], tag: "v3" },
			],
		});

		expect(result).toEqual({
			exports: { Counter: { storage: "sqlite", type: "durable-object" } },
			followUps: [],
		});
	});

	it("applies deletions before creations within one migration", ({
		expect,
	}) => {
		const result = infer({
			migrations: [
				{ new_classes: ["Counter"], tag: "v1" },
				{
					deleted_classes: ["Counter"],
					new_sqlite_classes: ["Counter"],
					tag: "v2",
				},
			],
		});

		expect(result).toEqual({
			exports: { Counter: { storage: "sqlite", type: "durable-object" } },
			followUps: [],
		});
	});

	it("applies renames before reusing the source name within one migration", ({
		expect,
	}) => {
		const result = infer({
			migrations: [
				{ new_classes: ["Old"], tag: "v1" },
				{
					new_sqlite_classes: ["Old"],
					renamed_classes: [{ from: "Old", to: "New" }],
					tag: "v2",
				},
			],
		});

		expect(result).toEqual({
			exports: {
				New: { storage: "legacy-kv", type: "durable-object" },
				Old: { storage: "sqlite", type: "durable-object" },
			},
			followUps: [],
		});
	});

	it("preserves explicit exports without review TODOs", ({ expect }) => {
		const exports = {
			Counter: { storage: "sqlite", type: "durable-object" },
			Incoming: {
				state: "expecting-transfer",
				storage: "legacy-kv",
				transfer_from: "source",
				type: "durable-object",
			},
			Old: { renamed_to: "Counter", state: "renamed", type: "durable-object" },
			Outgoing: {
				state: "transferred",
				transferred_to: "destination",
				type: "durable-object",
			},
			Retired: { state: "deleted", type: "durable-object" },
		} as const;
		const result = convertWranglerConfig(
			{ compatibility_date: "2026-09-23", exports, name: "worker" },
			"wrangler",
			[]
		);

		expect(result.followUps).toEqual([]);
		expect(renderCloudflareConfig(result)).toContain('renamedTo: "Counter"');
		expect(renderCloudflareConfig(result)).toContain('transferFrom: "source"');
		expect(renderCloudflareConfig(result)).not.toContain(
			"Migration incomplete"
		);
	});

	it("does not overwrite explicit export options", ({ expect }) => {
		const result = infer({
			exports: {
				Counter: {
					container: "container-reference",
					storage: "sqlite",
					type: "durable-object",
				},
			},
			migrations: [{ new_classes: ["Counter"], tag: "v1" }],
		});

		expect(result).toEqual({
			exports: {
				Counter: {
					container: "container-reference",
					storage: "sqlite",
					type: "durable-object",
				},
			},
			followUps: [],
		});
	});

	it.for(["Original", "Incoming"])(
		"requires transfer review for source class %s",
		(from, { expect }) => {
			const result = infer(
				{
					migrations: [
						{
							tag: "v1",
							transferred_classes: [
								{ from, from_script: "source", to: "Incoming" },
							],
						},
					],
				},
				"env.staging"
			);

			expect(result.followUps).toEqual([
				expect.objectContaining({
					blocking: true,
					code: "durable-object-transfer",
					sourcePath: "env.staging.migrations.0.transferred_classes.0",
				}),
			]);
			const message = result.followUps[0]?.message;
			expect(message).toContain(`\`${from}\``);
			expect(message).toContain("`source`");
			expect(message).toContain("`Incoming`");
			expect(message).toContain("If completed");
			expect(message).toContain("If pending");
			expect(message).toContain("expecting-transfer");
			expect(message).toContain("transferFrom");
			expect(message).toContain("rename separately");
			expect(result.exports.Incoming).toEqual({ type: "durable-object" });
		}
	);

	it("preserves transfer provenance through later renames", ({ expect }) => {
		const result = infer({
			migrations: [
				{
					tag: "v1",
					transferred_classes: [
						{ from: "Original", from_script: "source", to: "Incoming" },
					],
				},
				{ renamed_classes: [{ from: "Incoming", to: "Current" }], tag: "v2" },
			],
		});

		expect(result.followUps).toEqual([
			expect.objectContaining({
				code: "durable-object-transfer",
				message: expect.stringContaining("`Current`"),
				sourcePath: "migrations.0.transferred_classes.0",
			}),
		]);
		expect(result.followUps[0]?.message).toContain("`Original`");
		expect(result.followUps[0]?.message).toContain("`Incoming`");
		expect(result.followUps[0]?.message).toContain("`source`");
	});

	it.for(["created", "expecting-transfer"] as const)(
		"preserves an explicit %s declaration for a transferred class",
		(state, { expect }) => {
			const declared = {
				state,
				storage: "sqlite",
				...(state === "expecting-transfer" && { transfer_from: "source" }),
				type: "durable-object",
			};
			const result = infer({
				exports: { Incoming: declared },
				migrations: [
					{
						tag: "v1",
						transferred_classes: [
							{ from: "Incoming", from_script: "source", to: "Incoming" },
						],
					},
				],
			});

			expect(result).toEqual({
				exports: { Incoming: declared },
				followUps: [],
			});
		}
	);

	it("clears transfer provenance when a class is deleted and recreated", ({
		expect,
	}) => {
		const result = infer({
			migrations: [
				{
					tag: "v1",
					transferred_classes: [
						{ from: "Original", from_script: "source", to: "Incoming" },
					],
				},
				{
					deleted_classes: ["Incoming"],
					new_sqlite_classes: ["Incoming"],
					tag: "v2",
				},
			],
		});

		expect(result).toEqual({
			exports: { Incoming: { storage: "sqlite", type: "durable-object" } },
			followUps: [],
		});
	});

	it("identifies a rename whose creation migration is missing", ({
		expect,
	}) => {
		const result = infer({
			migrations: [
				{ renamed_classes: [{ from: "Old", to: "Current" }], tag: "v1" },
			],
		});

		expect(result.followUps).toEqual([
			expect.objectContaining({
				code: "durable-object-storage",
				message: expect.stringContaining("`Current`"),
				sourcePath: "migrations.0.renamed_classes",
			}),
		]);
	});

	it("does not need a storage backend for a subsequently deleted transfer", ({
		expect,
	}) => {
		const result = infer({
			migrations: [
				{
					tag: "v1",
					transferred_classes: [
						{ from: "Original", from_script: "source", to: "Incoming" },
					],
				},
				{ deleted_classes: ["Incoming"], tag: "v2" },
			],
		});

		expect(result).toEqual({
			exports: { Incoming: { state: "deleted", type: "durable-object" } },
			followUps: [],
		});
	});

	it("reports local bindings without history but preserves external bindings", ({
		expect,
	}) => {
		const result = convertWranglerConfig(
			{
				compatibility_date: "2026-09-23",
				durable_objects: {
					bindings: [
						{ class_name: "Counter", name: "COUNTER", script_name: "worker" },
						{ class_name: "Remote", name: "REMOTE", script_name: "other" },
					],
				},
				name: "worker",
			},
			"wrangler",
			[]
		);

		expect(result.followUps).toEqual([
			expect.objectContaining({
				code: "durable-object-export",
				message: expect.stringContaining("`Counter`"),
				sourcePath: "durable_objects.bindings.0",
			}),
		]);
		const output = renderCloudflareConfig(result);
		expect(output).toContain('worker: "other"');
		expect(output).not.toContain("Remote: exports.durableObject(");
		expect(output).toContain("Migration incomplete");
	});

	it("reports missing class names and missing explicit storage", ({
		expect,
	}) => {
		const result = convertWranglerConfig(
			{
				compatibility_date: "2026-09-23",
				// @ts-expect-error Raw migration input may omit the class name.
				durable_objects: { bindings: [{ name: "COUNTER" }] },
				// @ts-expect-error Raw migration input may omit the storage backend.
				exports: { Counter: { type: "durable-object" } },
				name: "worker",
			},
			"wrangler",
			[]
		);

		expect(
			result.followUps.map(({ code, sourcePath }) => ({ code, sourcePath }))
		).toEqual([
			{
				code: "durable-object-missing-class",
				sourcePath: "durable_objects.bindings.0",
			},
			{ code: "durable-object-storage", sourcePath: "exports.Counter" },
		]);
	});

	it("keeps Container and unsupported update strategy follow-ups", ({
		expect,
	}) => {
		const result = convertWranglerConfig(
			{
				compatibility_date: "2026-09-23",
				durable_objects: {
					code_update_strategy: { mode: "deferred" },
				},
				exports: {
					Counter: {
						container: "container",
						storage: "sqlite",
						type: "durable-object",
					},
				},
				name: "worker",
			},
			"wrangler",
			[]
		);

		expect(
			result.followUps.map(({ code, sourcePath }) => ({ code, sourcePath }))
		).toEqual([
			{ code: "unsupported-binding-options", sourcePath: "durable_objects" },
			{ code: "container-review", sourcePath: "exports.Counter" },
		]);
	});

	it("uses inherited history and environment-specific history independently", ({
		expect,
	}) => {
		const result = convertWranglerConfig(
			{
				compatibility_date: "2026-09-23",
				env: {
					custom: {
						durable_objects: {
							bindings: [{ class_name: "Custom", name: "CUSTOM" }],
						},
						migrations: [{ new_classes: ["Custom"], tag: "v1" }],
					},
					staging: {
						durable_objects: {
							bindings: [
								{
									class_name: "Counter",
									name: "COUNTER",
									script_name: "worker",
									environment: "staging",
								},
							],
						},
					},
				},
				migrations: [{ new_sqlite_classes: ["Counter"], tag: "v1" }],
				name: "worker",
			},
			"wrangler",
			[]
		);

		expect(result.followUps.filter(({ blocking }) => blocking)).toEqual([]);
		const output = renderCloudflareConfig(result);
		expect(output.match(/Counter: exports\.durableObject\(/g)).toHaveLength(2);
		expect(output).toContain('storage: "legacy-kv"');
		expect(output).toContain('worker: "worker-staging"');
		expect(output).not.toContain("Migration incomplete");
	});
});
