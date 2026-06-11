import { describe, it } from "vitest";
import { convertToolingConfig } from "../../experimental-config/convert";

describe("convertToolingConfig", () => {
	describe("empty input", () => {
		it("returns an empty object for an empty config", ({ expect }) => {
			expect(convertToolingConfig({})).toEqual({});
		});

		it("omits keys for undefined input fields rather than emitting `undefined` values", ({
			expect,
		}) => {
			const result = convertToolingConfig({});
			expect(Object.keys(result)).toEqual([]);
		});
	});

	describe("camelCase → snake_case top-level mappings", () => {
		it("maps noBundle to no_bundle", ({ expect }) => {
			expect(convertToolingConfig({ noBundle: true })).toEqual({
				no_bundle: true,
			});
		});

		it("passes minify through unchanged", ({ expect }) => {
			expect(convertToolingConfig({ minify: true })).toEqual({
				minify: true,
			});
		});

		it("maps keepNames to keep_names", ({ expect }) => {
			expect(convertToolingConfig({ keepNames: false })).toEqual({
				keep_names: false,
			});
		});

		it("passes alias through unchanged", ({ expect }) => {
			expect(
				convertToolingConfig({ alias: { "node:fs": "memfs", foo: "bar" } })
			).toEqual({
				alias: { "node:fs": "memfs", foo: "bar" },
			});
		});

		it("passes define through unchanged", ({ expect }) => {
			expect(
				convertToolingConfig({
					define: { "process.env.NODE_ENV": '"production"' },
				})
			).toEqual({
				define: { "process.env.NODE_ENV": '"production"' },
			});
		});

		it("maps findAdditionalModules to find_additional_modules", ({
			expect,
		}) => {
			expect(convertToolingConfig({ findAdditionalModules: true })).toEqual({
				find_additional_modules: true,
			});
		});

		it("maps preserveFileNames to preserve_file_names", ({ expect }) => {
			expect(convertToolingConfig({ preserveFileNames: true })).toEqual({
				preserve_file_names: true,
			});
		});

		it("maps baseDir to base_dir", ({ expect }) => {
			expect(convertToolingConfig({ baseDir: "./src" })).toEqual({
				base_dir: "./src",
			});
		});

		it("passes rules through unchanged", ({ expect }) => {
			const rules = [
				{ type: "Text" as const, globs: ["**/*.txt"], fallthrough: true },
				{ type: "CompiledWasm" as const, globs: ["**/*.wasm"] },
			];
			expect(convertToolingConfig({ rules })).toEqual({ rules });
		});

		it("maps wasmModules to wasm_modules", ({ expect }) => {
			expect(
				convertToolingConfig({ wasmModules: { foo: "./foo.wasm" } })
			).toEqual({
				wasm_modules: { foo: "./foo.wasm" },
			});
		});

		it("maps textBlobs to text_blobs", ({ expect }) => {
			expect(convertToolingConfig({ textBlobs: { foo: "./foo.txt" } })).toEqual(
				{
					text_blobs: { foo: "./foo.txt" },
				}
			);
		});

		it("maps dataBlobs to data_blobs", ({ expect }) => {
			expect(convertToolingConfig({ dataBlobs: { foo: "./foo.bin" } })).toEqual(
				{
					data_blobs: { foo: "./foo.bin" },
				}
			);
		});

		it("passes tsconfig through unchanged", ({ expect }) => {
			expect(convertToolingConfig({ tsconfig: "./tsconfig.json" })).toEqual({
				tsconfig: "./tsconfig.json",
			});
		});

		it("maps jsxFactory to jsx_factory", ({ expect }) => {
			expect(convertToolingConfig({ jsxFactory: "h" })).toEqual({
				jsx_factory: "h",
			});
		});

		it("maps jsxFragment to jsx_fragment", ({ expect }) => {
			expect(convertToolingConfig({ jsxFragment: "Fragment" })).toEqual({
				jsx_fragment: "Fragment",
			});
		});

		it("maps uploadSourceMaps to upload_source_maps", ({ expect }) => {
			expect(convertToolingConfig({ uploadSourceMaps: true })).toEqual({
				upload_source_maps: true,
			});
		});

		it("maps sendMetrics to send_metrics", ({ expect }) => {
			expect(convertToolingConfig({ sendMetrics: false })).toEqual({
				send_metrics: false,
			});
		});
	});

	describe("pythonModules", () => {
		it("maps to python_modules with exclude preserved", ({ expect }) => {
			expect(
				convertToolingConfig({ pythonModules: { exclude: ["a", "b"] } })
			).toEqual({
				python_modules: { exclude: ["a", "b"] },
			});
		});

		it("passes an empty pythonModules object through as python_modules: {}", ({
			expect,
		}) => {
			expect(convertToolingConfig({ pythonModules: {} })).toEqual({
				python_modules: {},
			});
		});

		it("preserves an explicit empty exclude array", ({ expect }) => {
			expect(convertToolingConfig({ pythonModules: { exclude: [] } })).toEqual({
				python_modules: { exclude: [] },
			});
		});
	});

	describe("build", () => {
		it("maps watchDir to watch_dir (string form)", ({ expect }) => {
			expect(
				convertToolingConfig({
					build: { command: "npm run build", cwd: ".", watchDir: "./src" },
				})
			).toEqual({
				build: {
					command: "npm run build",
					cwd: ".",
					watch_dir: "./src",
				},
			});
		});

		it("maps watchDir to watch_dir (array form)", ({ expect }) => {
			expect(
				convertToolingConfig({
					build: { watchDir: ["./src", "./vendor"] },
				})
			).toEqual({
				build: {
					command: undefined,
					cwd: undefined,
					watch_dir: ["./src", "./vendor"],
				},
			});
		});

		it("emits build with undefined sub-fields when only watchDir is provided", ({
			expect,
		}) => {
			// The conversion function unconditionally lays out the build object
			// when `parsed.build !== undefined`, leaving missing sub-fields as
			// `undefined`. This is intentional and matches downstream consumers.
			const result = convertToolingConfig({ build: { command: "x" } });
			expect(result.build).toEqual({
				command: "x",
				cwd: undefined,
				watch_dir: undefined,
			});
		});
	});

	describe("dev", () => {
		it("maps every renamed sub-field", ({ expect }) => {
			expect(
				convertToolingConfig({
					dev: {
						ip: "0.0.0.0",
						port: 8787,
						inspectorPort: 9229,
						inspectorIp: "127.0.0.1",
						localProtocol: "https",
						upstreamProtocol: "http",
						host: "example.com",
						enableContainers: true,
						containerEngine: "unix:///var/run/docker.sock",
					},
				})
			).toEqual({
				dev: {
					ip: "0.0.0.0",
					port: 8787,
					inspector_port: 9229,
					inspector_ip: "127.0.0.1",
					local_protocol: "https",
					upstream_protocol: "http",
					host: "example.com",
					enable_containers: true,
					container_engine: "unix:///var/run/docker.sock",
				},
			});
		});

		it("does NOT map dev.types into the output (consumed separately)", ({
			expect,
		}) => {
			const result = convertToolingConfig({
				dev: { port: 8787, types: { generate: false } },
			});
			// `dev.types` is intentionally not threaded through `RawConfig` —
			// it is consumed via `NormalizedTypes` on `LoadNewConfigResult`.
			expect(result.dev).toBeDefined();
			expect((result.dev as Record<string, unknown>).types).toBeUndefined();
			expect(JSON.stringify(result.dev)).not.toContain("generate");
		});

		it("emits dev with undefined sub-fields for absent options", ({
			expect,
		}) => {
			const result = convertToolingConfig({ dev: { port: 1234 } });
			expect(result.dev).toEqual({
				ip: undefined,
				port: 1234,
				inspector_port: undefined,
				inspector_ip: undefined,
				local_protocol: undefined,
				upstream_protocol: undefined,
				host: undefined,
				enable_containers: undefined,
				container_engine: undefined,
			});
		});
	});

	describe("assetsDirectory", () => {
		it("maps to assets.directory", ({ expect }) => {
			expect(convertToolingConfig({ assetsDirectory: "./public" })).toEqual({
				assets: { directory: "./public" },
			});
		});

		it("does not emit `assets` when assetsDirectory is absent", ({
			expect,
		}) => {
			expect(convertToolingConfig({ minify: true })).toEqual({ minify: true });
		});
	});

	describe("composite", () => {
		it("maps a fully populated config in a single pass", ({ expect }) => {
			const result = convertToolingConfig({
				noBundle: false,
				minify: true,
				keepNames: true,
				alias: { foo: "bar" },
				define: { FOO: "1" },
				findAdditionalModules: true,
				preserveFileNames: false,
				baseDir: "./src",
				rules: [{ type: "Text", globs: ["**/*.txt"] }],
				wasmModules: { w: "./w.wasm" },
				textBlobs: { t: "./t.txt" },
				dataBlobs: { d: "./d.bin" },
				tsconfig: "./tsconfig.json",
				jsxFactory: "h",
				jsxFragment: "Fragment",
				pythonModules: { exclude: ["py"] },
				uploadSourceMaps: true,
				build: { command: "build", cwd: ".", watchDir: "./src" },
				assetsDirectory: "./public",
				dev: { port: 8787 },
				sendMetrics: true,
			});

			expect(new Set(Object.keys(result))).toEqual(
				new Set([
					"no_bundle",
					"minify",
					"keep_names",
					"alias",
					"define",
					"find_additional_modules",
					"preserve_file_names",
					"base_dir",
					"rules",
					"wasm_modules",
					"text_blobs",
					"data_blobs",
					"tsconfig",
					"jsx_factory",
					"jsx_fragment",
					"python_modules",
					"upload_source_maps",
					"build",
					"assets",
					"dev",
					"send_metrics",
				])
			);

			expect(result.assets).toEqual({ directory: "./public" });
			expect(result.python_modules).toEqual({ exclude: ["py"] });
			expect(result.build).toMatchObject({ watch_dir: "./src" });
			expect(result.dev).toMatchObject({ port: 8787 });
		});
	});
});
