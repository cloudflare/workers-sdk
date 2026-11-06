import { describe, it } from "vitest";
import { convertConfigToBindings } from "../src/binding-utils";
import { normalizeAndValidateConfig } from "../src/config/validation";
import { mapWorkerMetadataBindings } from "../src/map-worker-metadata-bindings";
import type { RawConfig } from "../src/config";

const realtimekit = [
	{ binding: "RTK", app_id: "app-id", remote: true },
] as const;

describe("RealtimeKit configuration", () => {
	it("normalizes and converts the binding without losing remote opt-in", ({
		expect,
	}) => {
		const { config, diagnostics } = normalizeAndValidateConfig(
			{ realtimekit: [...realtimekit] },
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.hasErrors()).toBe(false);
		expect(diagnostics.hasWarnings()).toBe(false);
		expect(config.realtimekit).toEqual(realtimekit);
		expect(
			convertConfigToBindings({ realtimekit: config.realtimekit })
		).toEqual({
			RTK: { type: "realtimekit", app_id: "app-id", remote: true },
		});
	});

	it.for([undefined, false, "true", 1])(
		"rejects a missing or invalid remote opt-in: %j",
		(remote, { expect }) => {
			const { diagnostics } = normalizeAndValidateConfig(
				{
					realtimekit: [{ binding: "RTK", app_id: "app-id", remote }],
				} as unknown as RawConfig,
				undefined,
				undefined,
				{}
			);
			expect(diagnostics.hasErrors()).toBe(true);
			expect(diagnostics.renderErrors()).toContain("must have `remote: true`");
		}
	);

	it.for([undefined, "", " \t ", 42])(
		"rejects a missing or invalid app ID: %j",
		(app_id, { expect }) => {
			const { diagnostics } = normalizeAndValidateConfig(
				{
					realtimekit: [{ binding: "RTK", app_id, remote: true }],
				} as unknown as RawConfig,
				undefined,
				undefined,
				{}
			);
			expect(diagnostics.renderErrors()).toContain(
				'must have a non-empty string "app_id"'
			);
		}
	);

	it.for([null, "app-id", 42, []])(
		"rejects non-object binding entries: %j",
		(binding, { expect }) => {
			const { diagnostics } = normalizeAndValidateConfig(
				{ realtimekit: [binding] } as unknown as RawConfig,
				undefined,
				undefined,
				{}
			);
			expect(diagnostics.renderErrors()).toContain(
				"bindings should be objects"
			);
		}
	);

	it("does not inherit production bindings into a named environment", ({
		expect,
	}) => {
		const { config, diagnostics } = normalizeAndValidateConfig(
			{ realtimekit: [...realtimekit], env: { staging: {} } },
			undefined,
			undefined,
			{ env: "staging" }
		);
		expect(diagnostics.hasErrors()).toBe(false);
		expect(config.realtimekit).toEqual([]);
	});

	it("validates Preview configuration too", ({ expect }) => {
		const { config, diagnostics } = normalizeAndValidateConfig(
			{ previews: { realtimekit: [...realtimekit] } },
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.hasErrors()).toBe(false);
		expect(config.previews?.realtimekit).toEqual(realtimekit);
	});

	it("rejects missing remote opt-in in Preview configuration", ({ expect }) => {
		const { diagnostics } = normalizeAndValidateConfig(
			{
				previews: { realtimekit: [{ binding: "RTK", app_id: "app-id" }] },
			} as unknown as RawConfig,
			undefined,
			undefined,
			{}
		);
		expect(diagnostics.renderErrors()).toContain("must have `remote: true`");
	});

	it("maps multiple API bindings back into usable configuration", ({
		expect,
	}) => {
		expect(
			mapWorkerMetadataBindings([
				{ type: "realtimekit", name: "RTK", app_id: "app-id", remote: true },
				{
					type: "realtimekit",
					name: "OTHER",
					app_id: "other-app",
					remote: true,
				},
			])
		).toEqual({
			realtimekit: [
				...realtimekit,
				{ binding: "OTHER", app_id: "other-app", remote: true },
			],
		});
	});
});
