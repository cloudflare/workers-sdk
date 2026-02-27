import * as fs from "node:fs/promises";
import { beforeEach, describe, it, vi } from "vitest";
import { formatGeneratedTypes, generateTypes } from "../type-generation/api";
import * as generateRuntime from "../type-generation/runtime";
import { runInTempDir } from "./helpers/run-in-tmp";
import type { GenerateTypesResult } from "../type-generation/api";
import type { MockInstance } from "vitest";

describe("generateTypes API", () => {
	runInTempDir();

	let generateRuntimeTypesSpy: MockInstance;

	beforeEach(() => {
		// Mock runtime types generation to avoid spawning workerd
		generateRuntimeTypesSpy = vi
			.spyOn(generateRuntime, "generateRuntimeTypes")
			.mockResolvedValue({
				runtimeHeader: "// Runtime types generated with workerd@1.0.0",
				runtimeTypes: "<runtime types go here>",
			});
	});

	describe("generateTypes()", () => {
		it("should throw an error if neither configPath nor config is provided", async ({
			expect,
		}) => {
			await expect(generateTypes({})).rejects.toThrow(
				"Either `configPath` or `config` must be provided"
			);
		});

		it("should throw an error if config file does not exist", async ({
			expect,
		}) => {
			await expect(
				generateTypes({ configPath: "./nonexistent.jsonc" })
			).rejects.toThrow("Could not read file");
		});

		it("should throw an error if config path is a directory", async ({
			expect,
		}) => {
			await fs.mkdir("./config-dir/");

			await expect(
				generateTypes({ configPath: "./config-dir" })
			).rejects.toThrow("No config file detected");
		});

		it("should throw an error if both `includeEnv` and `includeRuntime` are `false`", async ({
			expect,
		}) => {
			await Promise.all([
				fs.writeFile(
					"./wrangler.jsonc",
					JSON.stringify({
						name: "test-worker",
						main: "./index.ts",
					})
				),
				fs.writeFile("./index.ts", "export default { fetch() {} }"),
			]);

			await expect(
				generateTypes({
					configPath: "./wrangler.jsonc",
					includeEnv: false,
					includeRuntime: false,
				})
			).rejects.toThrow(
				"At least one of `includeEnv` or `includeRuntime` must be true"
			);
		});

		it("should generate env types from a config file", async ({ expect }) => {
			await Promise.all([
				fs.writeFile(
					"./wrangler.jsonc",
					JSON.stringify({
						name: "test-worker",
						main: "./index.ts",
						kv_namespaces: [
							{
								binding: "MY_KV",
								id: "123",
							},
						],
						vars: {
							MY_VAR: "hello",
						},
					})
				),
				fs.writeFile("./index.ts", "export default { fetch() {} }"),
			]);

			const result = await generateTypes({
				configPath: "./wrangler.jsonc",
				includeRuntime: false,
			});

			expect(result.env).toContain("/* eslint-disable */");
			expect(result.env).toContain("MY_VAR");
			expect(result.env).toContain("MY_KV: KVNamespace");
			expect(result.runtime).toBeNull();
			expect(result.runtimeHeader).toBeNull();
		});

		it("should generate runtime types when `includeRuntime` is true", async ({
			expect,
		}) => {
			await Promise.all([
				fs.writeFile(
					"./wrangler.jsonc",
					JSON.stringify({
						name: "test-worker",
						main: "./index.ts",
					})
				),
				fs.writeFile("./index.ts", "export default { fetch() {} }"),
			]);

			const result = await generateTypes({
				configPath: "./wrangler.jsonc",
				includeRuntime: true,
			});

			expect(generateRuntimeTypesSpy).toHaveBeenCalled();
			expect(result.runtime).toContain("// Begin runtime types");
			expect(result.runtime).toContain("<runtime types go here>");
			expect(result.runtimeHeader).toBe(
				"// Runtime types generated with workerd@1.0.0"
			);
		});

		it("should skip runtime types when `includeRuntime` is false", async ({
			expect,
		}) => {
			await Promise.all([
				fs.writeFile(
					"./wrangler.jsonc",
					JSON.stringify({
						name: "test-worker",
						main: "./index.ts",
					})
				),
				fs.writeFile("./index.ts", "export default { fetch() {} }"),
			]);

			const result = await generateTypes({
				configPath: "./wrangler.jsonc",
				includeRuntime: false,
			});

			expect(generateRuntimeTypesSpy).not.toHaveBeenCalled();
			expect(result.runtime).toBeNull();
			expect(result.runtimeHeader).toBeNull();
		});

		it("should use custom envInterface name", async ({ expect }) => {
			await Promise.all([
				fs.writeFile(
					"./wrangler.jsonc",
					JSON.stringify({
						name: "test-worker",
						main: "./index.ts",
						vars: {
							FOO: "bar",
						},
					})
				),
				fs.writeFile("./index.ts", "export default { fetch() {} }"),
			]);

			const result = await generateTypes({
				configPath: "./wrangler.jsonc",
				envInterface: "MyCustomEnv",
				includeRuntime: false,
			});

			expect(result.env).toContain("interface MyCustomEnv");
		});

		it("should generate strict var types by default", async ({ expect }) => {
			await Promise.all([
				fs.writeFile(
					"./wrangler.jsonc",
					JSON.stringify({
						name: "test-worker",
						main: "./index.ts",
						vars: {
							BOOL_VAR: true,
							NUMBER_VAR: 42,
							STRING_VAR: "hello",
						},
					})
				),
				fs.writeFile("./index.ts", "export default { fetch() {} }"),
			]);

			const result = await generateTypes({
				configPath: "./wrangler.jsonc",
				includeRuntime: false,
				strictVars: true,
			});

			// Strict mode generates literal types
			expect(result.env).toContain('STRING_VAR: "hello"');
			expect(result.env).toContain("NUMBER_VAR: 42");
			expect(result.env).toContain("BOOL_VAR: true");
		});

		it("should generate loose var types when strictVars is false", async ({
			expect,
		}) => {
			await Promise.all([
				fs.writeFile(
					"./wrangler.jsonc",
					JSON.stringify({
						name: "test-worker",
						main: "./index.ts",
						vars: {
							NUMBER_VAR: 42,
							STRING_VAR: "hello",
						},
					})
				),
				fs.writeFile("./index.ts", "export default { fetch() {} }"),
			]);

			const result = await generateTypes({
				configPath: "./wrangler.jsonc",
				includeRuntime: false,
				strictVars: false,
			});

			// Non-strict mode generates primitive types
			expect(result.env).toContain("STRING_VAR: string");
			expect(result.env).toContain("NUMBER_VAR: number");
		});

		it("should generate types for multiple binding types", async ({
			expect,
		}) => {
			await Promise.all([
				fs.writeFile(
					"./wrangler.jsonc",
					JSON.stringify({
						name: "test-worker",
						main: "./index.ts",
						ai: {
							binding: "AI",
						},
						d1_databases: [
							{
								binding: "MY_D1",
								database_id: "d1-123",
								database_name: "my-db",
							},
						],
						kv_namespaces: [
							{
								binding: "MY_KV",
								id: "kv-123",
							},
						],
						queues: {
							producers: [
								{
									binding: "MY_QUEUE",
									queue: "my-queue",
								},
							],
						},
						r2_buckets: [
							{
								binding: "MY_R2",
								bucket_name: "my-bucket",
							},
						],
					})
				),
				fs.writeFile("./index.ts", "export default { fetch() {} }"),
			]);

			const result = await generateTypes({
				configPath: "./wrangler.jsonc",
				includeRuntime: false,
			});

			expect(result.env).toContain("MY_KV: KVNamespace");
			expect(result.env).toContain("MY_R2: R2Bucket");
			expect(result.env).toContain("MY_D1: D1Database");
			expect(result.env).toContain("MY_QUEUE: Queue");
			expect(result.env).toContain("AI: Ai");
		});

		it("should handle environment-specific types", async ({ expect }) => {
			await Promise.all([
				fs.writeFile(
					"./wrangler.jsonc",
					JSON.stringify({
						name: "test-worker",
						main: "./index.ts",
						env: {
							production: {
								vars: {
									PROD_VAR: "prod-value",
								},
							},
							staging: {
								vars: {
									STAGING_VAR: "staging-value",
								},
							},
						},
						vars: {
							SHARED: "shared",
						},
					})
				),
				fs.writeFile("./index.ts", "export default { fetch() {} }"),
			]);

			const result = await generateTypes({
				configPath: "./wrangler.jsonc",
				environment: "production",
				includeRuntime: false,
			});

			expect(result.env).toContain("PROD_VAR");
		});

		it("should return empty env string when no bindings are configured", async ({
			expect,
		}) => {
			await Promise.all([
				fs.writeFile(
					"./wrangler.jsonc",
					JSON.stringify({
						name: "test-worker",
						main: "./index.ts",
					})
				),
				fs.writeFile("./index.ts", "export default { fetch() {} }"),
			]);

			const result = await generateTypes({
				configPath: "./wrangler.jsonc",
				includeEnv: true,
				includeRuntime: false,
			});

			// Should still have a valid structure but no bindings
			expect(result.env).toBeDefined();
		});
	});

	describe("formatGeneratedTypes()", () => {
		it("should combine env and runtime types correctly", ({ expect }) => {
			const result = {
				env: "/* eslint-disable */\n// Generated by Wrangler\ndeclare namespace Cloudflare {}",
				runtime: "// Begin runtime types\n<runtime>",
				runtimeHeader: "// Runtime types generated with workerd@1.0.0",
			} satisfies GenerateTypesResult;

			const output = formatGeneratedTypes(result);

			// Runtime header should be inserted after env header but before declarations
			expect(output).toContain("/* eslint-disable */");
			expect(output).toContain("// Generated by Wrangler");
			expect(output).toContain("// Runtime types generated with workerd@1.0.0");
			expect(output).toContain("declare namespace Cloudflare");
			expect(output).toContain("// Begin runtime types");

			// Check order: header should come before runtime types content
			const runtimeHeaderIndex = output.indexOf("// Runtime types generated");
			const beginRuntimeIndex = output.indexOf("// Begin runtime types");
			expect(runtimeHeaderIndex).toBeLessThan(beginRuntimeIndex);
		});

		it("should handle env-only output", ({ expect }) => {
			const result = {
				env: "/* eslint-disable */\n// Generated by Wrangler\ndeclare namespace Cloudflare {}",
				runtime: null,
				runtimeHeader: null,
			} satisfies GenerateTypesResult;

			const output = formatGeneratedTypes(result);

			expect(output).toBe(result.env);
			expect(output).not.toContain("runtime");
		});

		it("should handle runtime-only output with eslint-disable", ({
			expect,
		}) => {
			const result = {
				env: "",
				runtime: "// Begin runtime types\n<runtime>",
				runtimeHeader: "// Runtime types generated with workerd@1.0.0",
			} satisfies GenerateTypesResult;

			const output = formatGeneratedTypes(result);

			expect(output).toContain("/* eslint-disable */");
			expect(output).toContain("// Runtime types generated with workerd@1.0.0");
			expect(output).toContain("// Begin runtime types");
		});

		it("should handle empty result gracefully", ({ expect }) => {
			const result = {
				env: "",
				runtime: null,
				runtimeHeader: null,
			} satisfies GenerateTypesResult;

			const output = formatGeneratedTypes(result);

			expect(output).toBe("");
		});
	});

	describe("integration with CLI output", () => {
		it("should produce output compatible with file writing", async ({
			expect,
		}) => {
			await Promise.all([
				fs.writeFile(
					"./wrangler.jsonc",
					JSON.stringify({
						name: "test-worker",
						main: "./index.ts",
						vars: {
							MY_VAR: "test",
						},
					})
				),
				fs.writeFile("./index.ts", "export default { fetch() {} }"),
			]);

			const result = await generateTypes({
				configPath: "./wrangler.jsonc",
				includeRuntime: true,
			});

			const output = formatGeneratedTypes(result);

			// Write to file and verify it's valid
			await fs.writeFile("./output.d.ts", output);
			const written = await fs.readFile("./output.d.ts", "utf-8");

			expect(written).toBe(output);
			expect(written).toContain("/* eslint-disable */");
			expect(written).toContain("MY_VAR");
		});
	});
});
