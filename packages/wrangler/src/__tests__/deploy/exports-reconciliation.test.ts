import {
	isExportsReconciliationErrorDetails,
	renderExportsReconciliationError,
	renderExportsReconciliationSuccess,
} from "@cloudflare/deploy-helpers";
import { describe, it } from "vitest";
import { mockConsoleMethods } from "../helpers/mock-console";
import type { ExportsReconciliationResult } from "@cloudflare/workers-utils";

describe("renderExportsReconciliationSuccess", () => {
	const std = mockConsoleMethods();

	function emptyResult(
		overrides: Partial<ExportsReconciliationResult> = {}
	): ExportsReconciliationResult {
		return {
			created: [],
			updated: [],
			deleted: [],
			renamed: [],
			warnings: [],
			info: [],
			removable_entries: [],
			...overrides,
		};
	}

	it("emits no output when nothing changed", ({ expect }) => {
		renderExportsReconciliationSuccess(emptyResult());

		expect(std.out).toEqual("");
		expect(std.warn).toEqual("");
	});

	it("renders created / updated / deleted lists wrapped in blank lines", ({
		expect,
	}) => {
		renderExportsReconciliationSuccess(
			emptyResult({
				created: ["MyDO"],
				updated: ["UpdatedDO"],
				deleted: ["OldDO"],
			})
		);

		expect(std.out).toMatchInlineSnapshot(`
			"
			Durable Object exports reconciliation:
			  Created: MyDO
			  Updated: UpdatedDO
			  Deleted: OldDO
			"
		`);
	});

	it("renders renamed pairs with an arrow", ({ expect }) => {
		renderExportsReconciliationSuccess(
			emptyResult({
				renamed: [{ from: "PrevName", to: "NewName" }],
			})
		);

		expect(std.out).toMatchInlineSnapshot(`
			"
			Durable Object exports reconciliation:
			  Renamed: PrevName → NewName
			"
		`);
	});

	it("renders transferred and transfer_pending entries", ({ expect }) => {
		renderExportsReconciliationSuccess(
			emptyResult({
				transferred: [
					{ class: "Movee", to_script: "target-worker", phase: "committed" },
				],
				transfer_pending: [{ class: "Incoming", from_script: "source-worker" }],
			})
		);

		expect(std.out).toMatchInlineSnapshot(`
			"
			Durable Object exports reconciliation:
			  Transferred (committed): Movee → target-worker
			  Transfer pending: Incoming ← source-worker
			"
		`);
	});

	it("renders info entries dimly under an indented `Info:` heading and surfaces referencing_scripts", ({
		expect,
	}) => {
		renderExportsReconciliationSuccess(
			emptyResult({
				info: [
					{
						class: "OldName",
						scenario: "tombstone_class_still_in_code",
						message:
							"Class still in code; this is the supported rollout pattern.",
					},
					{
						class: "OldRenamed",
						scenario: "stale_tombstone",
						message: "Tombstone has no effect.",
						referencing_scripts: ["worker-foo", "worker-bar"],
					},
				],
			})
		);

		// The `Info:` sub-heading sits at the same 2-space indent as
		// Created/Updated/etc., with each entry indented one further level
		// so the whole block nests visually under the reconciliation header.
		expect(std.out).toContain("  Info:");
		expect(std.out).toContain("    [tombstone_class_still_in_code] OldName");
		expect(std.out).toContain("    [stale_tombstone] OldRenamed");
		expect(std.out).toContain("(referenced by: worker-foo, worker-bar)");
	});

	it("renders warnings to stderr under an indented `Warnings:` heading", ({
		expect,
	}) => {
		renderExportsReconciliationSuccess(
			emptyResult({
				warnings: [
					{
						class: "Foo",
						scenario: "future_warning_scenario",
						message: "A warning.",
					},
				],
			})
		);

		expect(std.warn).toContain("  Warnings:");
		expect(std.warn).toContain("    [future_warning_scenario] Foo: A warning.");
	});

	it("renders the removable_entries one-liner indented under the block", ({
		expect,
	}) => {
		renderExportsReconciliationSuccess(
			emptyResult({
				info: [
					{
						class: "OldGone",
						scenario: "stale_tombstone",
						message: "Already gone.",
					},
				],
				removable_entries: ["OldGone"],
			})
		);

		expect(std.out).toContain("  Safe to remove from `exports`: OldGone");
	});

	it("brackets the block with leading and trailing blank lines", ({
		expect,
	}) => {
		renderExportsReconciliationSuccess(
			emptyResult({
				created: ["MyDO"],
			})
		);

		// The renderer wraps the block in blank lines so it sits cleanly
		// between the upstream "Total Upload" summary and the downstream
		// bindings table.
		expect(std.out).toMatchInlineSnapshot(`
			"
			Durable Object exports reconciliation:
			  Created: MyDO
			"
		`);
	});
});

describe("renderExportsReconciliationError", () => {
	it("formats per-class details with scenario, message, and optional fields", ({
		expect,
	}) => {
		const formatted = renderExportsReconciliationError([
			{
				class: "Foo",
				scenario: "config_export_not_in_code",
				message: "Live config refers to a class the code does not export.",
				suggestion:
					"Add the class back to the code or replace the entry with a tombstone.",
			},
			{
				class: "Bar",
				scenario: "orphaned_provisioned_namespace",
				message: "No config entry for a provisioned namespace.",
				suggestion: "Add a tombstone entry for the class.",
				referencing_scripts: ["worker-foo", "worker-bar"],
			},
		]);

		expect(formatted).toContain(
			"Durable Object exports reconciliation failed:"
		);
		expect(formatted).toContain("[config_export_not_in_code] class 'Foo'");
		expect(formatted).toContain("[orphaned_provisioned_namespace] class 'Bar'");
		expect(formatted).toContain(
			"Suggestion: Add a tombstone entry for the class."
		);
		expect(formatted).toContain("Referencing scripts: worker-foo, worker-bar");
	});
});

describe("isExportsReconciliationErrorDetails", () => {
	it("accepts a well-formed details array", ({ expect }) => {
		expect(
			isExportsReconciliationErrorDetails([
				{ class: "Foo", scenario: "any", message: "msg" },
			])
		).toBe(true);
	});

	it("rejects non-array values", ({ expect }) => {
		expect(isExportsReconciliationErrorDetails(undefined)).toBe(false);
		expect(isExportsReconciliationErrorDetails(null)).toBe(false);
		expect(isExportsReconciliationErrorDetails("foo")).toBe(false);
		expect(isExportsReconciliationErrorDetails({})).toBe(false);
	});

	it("rejects entries missing required fields", ({ expect }) => {
		expect(isExportsReconciliationErrorDetails([{ class: "Foo" }])).toBe(false);
		expect(
			isExportsReconciliationErrorDetails([{ class: "Foo", scenario: "any" }])
		).toBe(false);
	});
});
