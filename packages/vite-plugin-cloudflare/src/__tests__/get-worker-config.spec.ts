import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { getWorkerConfig } from "../workers-configs";

describe("getWorkerConfig", () => {
	test("should return a simple raw config", () => {
		const { raw } = getWorkerConfig(
			fileURLToPath(new URL("fixtures/simple-wrangler.jsonc", import.meta.url)),
			undefined
		);
		expect(typeof raw).toEqual("object");

		expect(raw.ai).toBeUndefined();
		expect(raw.alias).toBeUndefined();
		expect(raw.base_dir).toBeUndefined();
		expect(raw.build).toEqual({
			command: undefined,
			cwd: undefined,
			watch_dir: "./src",
		});
		expect(raw.compatibility_flags).toEqual([]);
		expect(raw.define).toEqual({});
		expect(raw.find_additional_modules).toBeUndefined();
		expect(raw.main).toMatch(/index\.ts$/);
		expect(raw.minify).toBeUndefined();
		expect(raw.name).toEqual("my-worker");
		expect(raw.no_bundle).toBeUndefined();
		expect(raw.preserve_file_names).toBeUndefined();
		expect(raw.rules).toEqual([]);
		expect(raw.site).toBeUndefined();
		expect(raw.tsconfig).toBeUndefined();
	});

	test("should return a simple config without non-applicable fields", () => {
		const { config } = getWorkerConfig(
			fileURLToPath(new URL("fixtures/simple-wrangler.jsonc", import.meta.url)),
			undefined
		);
		expect(typeof config).toEqual("object");

		expect("preserve_file_names" in config).toBeFalsy();
	});

	test("should not return any non-applicable config when there isn't any", () => {
		const { nonApplicable } = getWorkerConfig(
			fileURLToPath(new URL("fixtures/simple-wrangler.jsonc", import.meta.url)),
			undefined
		);
		expect(nonApplicable).toEqual({
			replacedByVite: new Set(),
			notRelevant: new Set(),
		});
	});

	test("should read a simple wrangler.toml file", () => {
		const { config, nonApplicable } = getWorkerConfig(
			fileURLToPath(new URL("fixtures/simple-wrangler.jsonc", import.meta.url)),
			undefined
		);
		expect(typeof config).toEqual("object");

		expect(config.ai).toBeUndefined();
		expect(config.alias).toBeUndefined();
		expect(config.base_dir).toBeUndefined();
		expect("build" in config).toBeFalsy();
		expect(config.compatibility_flags).toEqual([]);
		expect("define" in config).toBeFalsy();
		expect(config.find_additional_modules).toBeUndefined();
		expect(config.main).toMatch(/index\.ts$/);
		expect(config.minify).toBeUndefined();
		expect(config.name).toEqual("my-worker");
		expect(config.no_bundle).toBeUndefined();
		expect(config.preserve_file_names).toBeUndefined();
		expect(config.rules).toEqual([]);
		expect(config.site).toBeUndefined();
		expect(config.tsconfig).toBeUndefined();

		expect(nonApplicable).toEqual({
			replacedByVite: new Set(),
			notRelevant: new Set(),
		});
	});

	test("should collect non applicable configs", () => {
		const { config, raw, nonApplicable } = getWorkerConfig(
			fileURLToPath(
				new URL(
					"fixtures/wrangler-with-fields-to-ignore.jsonc",
					import.meta.url
				)
			),
			undefined
		);

		expect(typeof config).toEqual("object");

		expect(config.ai).toBeUndefined();
		expect("alias" in config).toBeFalsy();
		expect(raw.alias).toEqual({
			"my-test": "./my-test.ts",
			"my-test-a": "./my-test-a.ts",
		});
		expect("base_dir" in config).toBeFalsy();
		expect(raw.base_dir).toMatch(/src$/);
		expect("build" in config).toBeFalsy();
		expect(raw.build).toEqual({
			command: "npm run build",
			cwd: "build_cwd",
			watch_dir: expect.stringMatching(/build_watch_dir/),
		});
		expect(config.compatibility_flags).toEqual([]);
		expect("define" in config).toBeFalsy();
		expect(raw.define).toEqual({
			"define-a": "a",
			"define-b": "b",
		});
		expect("find_additional_modules" in config).toBeFalsy();
		expect(raw.find_additional_modules).toBe(false);
		expect(config.main).toMatch(/index\.ts$/);
		expect("minify" in config).toBeFalsy();
		expect(raw.minify).toBe(true);
		expect(config.name).toEqual("my-worker");
		expect("no_bundle" in config).toBeFalsy();
		expect(raw.no_bundle).toEqual(false);
		expect("preserve_file_names" in config).toBeFalsy();
		expect(raw.preserve_file_names).toBe(true);
		expect(config.rules).toEqual([
			{ type: "Text", globs: ["**/*.md"], fallthrough: true },
		]);
		expect("site" in config).toBeFalsy();
		expect(raw.site).toEqual({
			bucket: "./public",
			"entry-point": undefined,
			exclude: ["ignore_dir"],
			include: ["upload_dir"],
		});
		expect("tsconfig" in config).toBeFalsy();
		expect(raw.tsconfig).toMatch(/tsconfig\.custom\.json$/);

		expect(nonApplicable.replacedByVite).toEqual(
			new Set(["define", "alias", "minify"])
		);
		expect(nonApplicable.notRelevant).toEqual(
			new Set([
				"base_dir",
				"build",
				"find_additional_modules",
				"no_bundle",
				"preserve_file_names",
				"rules",
				"site",
				"tsconfig",
			])
		);
	});

	describe("invalid main config", () => {
		test("should throw if the provided main config doesn't point to an existing file", () => {
			expect(() =>
				getWorkerConfig(
					fileURLToPath(
						new URL(
							"fixtures/non-existing-main-wrangler.jsonc",
							import.meta.url
						)
					),
					undefined
				)
			).toThrowError(
				/The provided Wrangler config main field \(.*?index\.ts\) doesn't point to an existing file/
			);
		});
	});
});
