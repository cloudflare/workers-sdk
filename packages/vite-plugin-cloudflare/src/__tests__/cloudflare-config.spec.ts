import * as fs from "node:fs";
import * as path from "node:path";
import { removeDirSync } from "@cloudflare/workers-utils";
import { afterEach, beforeEach, describe, test, vi } from "vitest";
import { resolvePluginConfig } from "../plugin-config";
import type { WorkersResolvedConfig } from "../plugin-config";

const {
	RUNTIME_MARKER,
	FAKE_RUNTIME_HEADER,
	FAKE_RUNTIME_TYPES,
	generateRuntimeTypesMock,
} = vi.hoisted(() => ({
	RUNTIME_MARKER: "// Begin runtime types",
	FAKE_RUNTIME_HEADER:
		"// Runtime types generated with workerd@1.0.0 2024-12-30 ",
	FAKE_RUNTIME_TYPES: "declare type __FakeRuntimeType = true;",
	generateRuntimeTypesMock: vi.fn(),
}));

vi.mock("@cloudflare/runtime-types", () => ({
	RUNTIME_TYPES_MARKER: RUNTIME_MARKER,
	generateRuntimeTypes: generateRuntimeTypesMock,
}));

const viteEnv = { mode: "development", command: "serve" as const };
const viteBuildEnv = { mode: "production", command: "build" as const };
const FIXTURES_ROOT = path.resolve(__dirname, "fixtures", "cloudflare-config");

describe("cloudflare.config.ts", () => {
	let root: string;

	beforeEach(() => {
		generateRuntimeTypesMock.mockReset();
		generateRuntimeTypesMock.mockResolvedValue({
			runtimeHeader: FAKE_RUNTIME_HEADER,
			runtimeTypes: FAKE_RUNTIME_TYPES,
			isCached: false,
		});
		fs.mkdirSync(FIXTURES_ROOT, { recursive: true });
		root = fs.realpathSync(fs.mkdtempSync(path.join(FIXTURES_ROOT, "case-")));
	});

	afterEach(() => removeDirSync(root));

	function seedWorker(options?: { env?: string }) {
		fs.mkdirSync(path.join(root, "src"), { recursive: true });
		fs.writeFileSync(path.join(root, "src/index.ts"), "export default {};");
		fs.writeFileSync(
			path.join(root, "cloudflare.config.ts"),
			[
				"import { defineWorker } from '@cloudflare/config';",
				"export default defineWorker({",
				"  name: 'entry-worker',",
				"  entrypoint: './src/index.ts',",
				"  compatibilityDate: '2024-12-30',",
				options?.env ?? "",
				"});",
			].join("\n")
		);
	}

	test("is optional", async ({ expect }) => {
		const result = await resolvePluginConfig({}, { root }, viteEnv);

		expect(result.type).toBe("assets-only");
		if (result.type === "assets-only") {
			expect(result.configPaths).toEqual(new Set());
			expect(result.parsedConfig).toEqual({});
		}
	});

	test("is the default config source", async ({ expect }) => {
		seedWorker();
		const result = (await resolvePluginConfig(
			{},
			{ root },
			viteEnv
		)) as WorkersResolvedConfig;

		expect(result.type).toBe("workers");
		expect(result.types).toEqual({
			generate: true,
			includeRuntime: true,
		});
		expect(result.configPaths).toContain(
			path.join(root, "cloudflare.config.ts")
		);
		expect(result.entryWorkerEnvironmentName).toBe("ssr");
		expect(result.environmentNameToWorkerMap.get("ssr")?.config).toMatchObject({
			name: "entry-worker",
			compatibilityDate: "2024-12-30",
			entrypoint: path.join(root, "src/index.ts"),
		});
	});

	test("does not generate types for an entry Worker configured only in Vite", async ({
		expect,
	}) => {
		fs.mkdirSync(path.join(root, "src"), { recursive: true });
		fs.writeFileSync(path.join(root, "src/index.ts"), "export default {};");
		fs.writeFileSync(
			path.join(root, "cloudflare.config.ts"),
			"export const settings = { type: 'settings' };"
		);

		const result = await resolvePluginConfig(
			{ config: { entrypoint: "./src/index.ts" } },
			{ root },
			viteEnv
		);

		expect(result.type).toBe("workers");
		if (result.type === "workers") {
			expect(
				result.environmentNameToWorkerMap.get("ssr")?.config.entrypoint
			).toBe(path.join(root, "src/index.ts"));
			expect(result.configPaths).toContain(
				path.join(root, "cloudflare.config.ts")
			);
		}
		expect(fs.existsSync(path.join(root, "worker-configuration.d.ts"))).toBe(
			false
		);
		expect(generateRuntimeTypesMock).not.toHaveBeenCalled();
	});

	test("generates types from the config file before applying the entry customizer", async ({
		expect,
	}) => {
		seedWorker({
			env: "  env: { FILE_ONLY: { type: 'text', value: 'file' } },",
		});

		const result = (await resolvePluginConfig(
			{
				config: {
					env: { PLUGIN_ONLY: { type: "text", value: "plugin" } },
				},
			},
			{ root },
			viteEnv
		)) as WorkersResolvedConfig;

		const entry = result.environmentNameToWorkerMap.get("ssr");
		expect(entry?.config.env).toMatchObject({
			FILE_ONLY: { type: "text", value: "file" },
			PLUGIN_ONLY: { type: "text", value: "plugin" },
		});
		const parsedEntry = result.parsedConfig.default;
		expect(parsedEntry?.type).toBe("worker");
		if (parsedEntry?.type === "worker") {
			expect(parsedEntry.env).toEqual({
				FILE_ONLY: { type: "text", value: "file" },
			});
		}

		const content = fs.readFileSync(
			path.join(root, "worker-configuration.d.ts"),
			"utf8"
		);
		expect(content).toContain(
			'import("@cloudflare/vite-plugin/experimental-config")'
		);
		expect(content).toContain('import("./cloudflare.config").default');
		expect(content).toContain(RUNTIME_MARKER);
		expect(content).toContain(FAKE_RUNTIME_TYPES);
	});

	test("supports disabling generated and runtime types", async ({ expect }) => {
		seedWorker();

		await resolvePluginConfig(
			{ types: { generate: false } },
			{ root },
			viteEnv
		);
		expect(fs.existsSync(path.join(root, "worker-configuration.d.ts"))).toBe(
			false
		);

		await resolvePluginConfig(
			{ types: { includeRuntime: false } },
			{ root },
			viteEnv
		);
		const content = fs.readFileSync(
			path.join(root, "worker-configuration.d.ts"),
			"utf8"
		);
		expect(content).not.toContain(RUNTIME_MARKER);
		expect(generateRuntimeTypesMock).not.toHaveBeenCalled();
	});

	test("does not generate types during build", async ({ expect }) => {
		seedWorker();
		await resolvePluginConfig({}, { root }, viteBuildEnv);
		expect(fs.existsSync(path.join(root, "worker-configuration.d.ts"))).toBe(
			false
		);
	});
});
