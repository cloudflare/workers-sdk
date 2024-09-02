import * as fs from "node:fs";
import patchConsole from "patch-console";
import Dev from "../dev/dev";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import { writeWranglerToml } from "./helpers/write-wrangler-toml";
import type { Mock } from "vitest";

runInTempDir();

mockConsoleMethods();
afterEach(() => {
	(Dev as Mock).mockClear();
	patchConsole(() => {});
});

describe("dotenv", () => {
	it("should set process.env and import.meta.env when enabled in wrangler.toml", async () => {
		writeWranglerToml({
			main: "index.js",
			dotenv: true,
		});
		fs.writeFileSync("index.js", `export default {};`);
		fs.writeFileSync(".env", "TEST_VAR=test_value");
		await runWrangler("dev --no-x-dev-env");
		expect((Dev as Mock).mock.calls[0][0].define).toMatchInlineSnapshot(`
			Object {
			  "import.meta.env.TEST_VAR": "\\"test_value\\"",
			  "process.env.TEST_VAR": "\\"test_value\\"",
			}
		`);
	});

	it("should not set process.env or import.meta.env when disabled in wrangler.toml", async () => {
		writeWranglerToml({
			main: "index.js",
			dotenv: false,
		});
		fs.writeFileSync("index.js", `export default {};`);
		fs.writeFileSync(".env", "TEST_VAR=test_value");
		await runWrangler("dev --no-x-dev-env");
		expect((Dev as Mock).mock.calls[0][0].define).toMatchInlineSnapshot(
			`Object {}`
		);
	});

	it("for --env xyz, it should read from .env.xyz", async () => {
		writeWranglerToml({
			main: "index.js",
			dotenv: true,
		});
		fs.writeFileSync("index.js", `export default {};`);
		fs.writeFileSync(".env", "TEST_VAR=test_value");
		fs.writeFileSync(".env.xyz", "TEST_VAR=test_value_xyz");
		await runWrangler("dev --no-x-dev-env --env xyz");
		expect((Dev as Mock).mock.calls[0][0].define).toMatchInlineSnapshot(`
			Object {
			  "import.meta.env.TEST_VAR": "\\"test_value_xyz\\"",
			  "process.env.TEST_VAR": "\\"test_value_xyz\\"",
			}
		`);
	});

	it("should set process.env and import.meta.env when enabled in wrangler.toml with --dotenv flag", async () => {
		writeWranglerToml({
			main: "index.js",
		});
		fs.writeFileSync("index.js", `export default {};`);
		fs.writeFileSync(".env", "TEST_VAR=test_value");
		await runWrangler("dev --no-x-dev-env --dotenv");
		expect((Dev as Mock).mock.calls[0][0].define).toMatchInlineSnapshot(`
			Object {
			  "import.meta.env.TEST_VAR": "\\"test_value\\"",
			  "process.env.TEST_VAR": "\\"test_value\\"",
			}
		`);
	});

	it("should set process.env and import.meta.env from a custom env file", async () => {
		writeWranglerToml({
			main: "index.js",
		});
		fs.writeFileSync("index.js", `export default {};`);
		fs.mkdirSync("./path/to/custom", { recursive: true });
		fs.writeFileSync(
			"./path/to/custom/.some-custom-env",
			"TEST_VAR=test_value"
		);
		await runWrangler(
			"dev --no-x-dev-env --dotenv --env-file=./path/to/custom/.some-custom-env"
		);
		expect((Dev as Mock).mock.calls[0][0].define).toMatchInlineSnapshot(
			`
			Object {
			  "import.meta.env.TEST_VAR": "\\"test_value\\"",
			  "process.env.TEST_VAR": "\\"test_value\\"",
			}
		`
		);
	});

	it("should read a process.env and import.meta.env value passed via --penv argument", async () => {
		writeWranglerToml({
			main: "index.js",
		});
		fs.writeFileSync("index.js", `export default {};`);
		await runWrangler("dev --no-x-dev-env --penv=TEST_VAR=test_value");
		expect((Dev as Mock).mock.calls[0][0].define).toMatchInlineSnapshot(
			`
			Object {
			  "import.meta.env.TEST_VAR": "\\"test_value\\"",
			  "process.env.TEST_VAR": "\\"test_value\\"",
			}
		`
		);
	});

	it("should read --penv from the environment", async () => {
		writeWranglerToml({
			main: "index.js",
		});
		fs.writeFileSync("index.js", `export default {};`);
		vi.stubEnv("TEST_VAR", "test_value");
		await runWrangler("dev --no-x-dev-env --penv TEST_VAR");
		expect((Dev as Mock).mock.calls[0][0].define).toMatchInlineSnapshot(
			`
			Object {
			  "import.meta.env.TEST_VAR": "\\"test_value\\"",
			  "process.env.TEST_VAR": "\\"test_value\\"",
			}
		`
		);
	});
});
