import * as fs from "node:fs";
import { experimental_readRawConfig } from "@cloudflare/workers-utils";
import { writeWranglerConfig } from "@cloudflare/workers-utils/test-helpers";
import { describe, it } from "vitest";
import { readConfig } from "../../config";
import { runInTempDir } from "../helpers/run-in-tmp";

describe("readConfig()", () => {
	runInTempDir();
	it("should not error if a python entrypoint is used with the right compatibility_flag", ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "index.py",
			compatibility_flags: ["python_workers"],
		});
		const config = readConfig({ config: "wrangler.toml" });
		expect(config.rules).toMatchInlineSnapshot(`
			[
			  {
			    "globs": [
			      "**/*.py",
			    ],
			    "type": "PythonModule",
			  },
			]
		`);
	});
	it("should error if a python entrypoint is used without the right compatibility_flag", ({
		expect,
	}) => {
		writeWranglerConfig({
			main: "index.py",
		});
		try {
			readConfig({ config: "wrangler.toml" });
			expect.fail();
		} catch (e) {
			expect(e).toMatchInlineSnapshot(
				`[Error: The \`python_workers\` compatibility flag is required to use Python.]`
			);
		}
	});
});

describe("experimental_readRawConfig()", () => {
	describe.each(["json", "jsonc", "toml"])(
		`with %s config files`,
		(configType) => {
			runInTempDir();
			it(`should find a ${configType} config file given a specific path`, ({
				expect,
			}) => {
				fs.mkdirSync("../folder", { recursive: true });
				writeWranglerConfig(
					{ name: "config-one" },
					`../folder/config.${configType}`
				);

				const result = experimental_readRawConfig({
					config: `../folder/config.${configType}`,
				});
				expect(result.rawConfig).toEqual(
					expect.objectContaining({
						name: "config-one",
					})
				);
			});

			it("should find a config file given a specific script", ({ expect }) => {
				fs.mkdirSync("./path/to", { recursive: true });
				writeWranglerConfig(
					{ name: "config-one" },
					`./path/wrangler.${configType}`
				);

				fs.mkdirSync("../folder", { recursive: true });
				writeWranglerConfig(
					{ name: "config-two" },
					`../folder/wrangler.${configType}`
				);

				let result = experimental_readRawConfig({
					script: "./path/to/index.js",
				});
				expect(result.rawConfig).toEqual(
					expect.objectContaining({
						name: "config-one",
					})
				);

				result = experimental_readRawConfig({
					script: "../folder/index.js",
				});
				expect(result.rawConfig).toEqual(
					expect.objectContaining({
						name: "config-two",
					})
				);
			});
		}
	);
});

describe("BOM (Byte Order Marker) handling", () => {
	runInTempDir();

	it("should remove UTF-8 BOM from TOML config files", ({ expect }) => {
		const configContent = `name = "test-worker"
compatibility_date = "2022-01-12"`;

		fs.writeFileSync(
			"wrangler.toml",
			Buffer.concat([
				Buffer.from([0xef, 0xbb, 0xbf]),
				Buffer.from(configContent, "utf-8"),
			])
		);

		const config = readConfig({ config: "wrangler.toml" });
		expect(config.name).toBe("test-worker");
		expect(config.compatibility_date).toBe("2022-01-12");
	});

	it("should remove UTF-8 BOM from JSON config files", ({ expect }) => {
		const configContent = `{
	"name": "test-worker",
	"compatibility_date": "2022-01-12"
}`;

		fs.writeFileSync(
			"wrangler.json",
			Buffer.concat([
				Buffer.from([0xef, 0xbb, 0xbf]),
				Buffer.from(configContent, "utf-8"),
			])
		);

		const config = readConfig({ config: "wrangler.json" });
		expect(config.name).toBe("test-worker");
		expect(config.compatibility_date).toBe("2022-01-12");
	});

	it("should error on UTF-16 BE BOM", ({ expect }) => {
		const bomBytes = Buffer.from([0xfe, 0xff]);
		const configContent = Buffer.from('{"name": "test"}', "utf-8");
		fs.writeFileSync("wrangler.json", Buffer.concat([bomBytes, configContent]));

		expect(() => readConfig({ config: "wrangler.json" })).toThrow(
			"Configuration file contains UTF-16 BE byte order marker"
		);
	});

	it("should error on UTF-16 LE BOM", ({ expect }) => {
		const bomBytes = Buffer.from([0xff, 0xfe]);
		const configContent = Buffer.from('{"name": "test"}', "utf-8");
		fs.writeFileSync("wrangler.json", Buffer.concat([bomBytes, configContent]));

		expect(() => readConfig({ config: "wrangler.json" })).toThrow(
			"Configuration file contains UTF-16 LE byte order marker"
		);
	});

	it("should error on UTF-32 BE BOM", ({ expect }) => {
		const bomBytes = Buffer.from([0x00, 0x00, 0xfe, 0xff]);
		const configContent = Buffer.from('{"name": "test"}', "utf-8");
		fs.writeFileSync("wrangler.json", Buffer.concat([bomBytes, configContent]));

		expect(() => readConfig({ config: "wrangler.json" })).toThrow(
			"Configuration file contains UTF-32 BE byte order marker"
		);
	});

	it("should error on UTF-32 LE BOM", ({ expect }) => {
		const bomBytes = Buffer.from([0xff, 0xfe, 0x00, 0x00]);
		const configContent = Buffer.from('{"name": "test"}', "utf-8");
		fs.writeFileSync("wrangler.json", Buffer.concat([bomBytes, configContent]));

		expect(() => readConfig({ config: "wrangler.json" })).toThrow(
			"Configuration file contains UTF-32 LE byte order marker"
		);
	});

	it("should handle files without BOM normally", ({ expect }) => {
		writeWranglerConfig({ name: "no-bom-test" });

		const config = readConfig({ config: "wrangler.toml" });
		expect(config.name).toBe("no-bom-test");
	});
});
