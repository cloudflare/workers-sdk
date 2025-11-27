import * as fs from "node:fs";
import { validateHttpsOptions } from "../https-options";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("validateHttpsOptions()", () => {
	runInTempDir();

	it("should return undefined if nothing is passed in", async () => {
		const result = await validateHttpsOptions();
		expect(result).toBeUndefined();
	});

	it("should read the certs from the paths if provided", async () => {
		fs.mkdirSync("./certs");
		await fs.promises.writeFile("./certs/test.key", "xxxxx");
		await fs.promises.writeFile("./certs/test.pem", "yyyyy");
		const options = validateHttpsOptions(
			"./certs/test.key",
			"./certs/test.pem"
		);
		assert(options);
		expect(options.key).toEqual("xxxxx");
		expect(options.cert).toEqual("yyyyy");
	});

	it("should error if only one of the two paths is provided", async () => {
		expect(() =>
			validateHttpsOptions("./certs/test.key", undefined)
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Must specify both certificate path and key path to use a Custom Certificate.]`
		);
		expect(() =>
			validateHttpsOptions(undefined, "./certs/test.pem")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Must specify both certificate path and key path to use a Custom Certificate.]`
		);
	});

	it("should error if the key file does not exist", async () => {
		fs.mkdirSync("./certs");
		await fs.promises.writeFile("./certs/test.pem", "yyyyy");
		expect(() =>
			validateHttpsOptions("./certs/test.key", "./certs/test.pem")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Missing Custom Certificate Key at ./certs/test.key]`
		);
	});

	it("should error if the cert file does not exist", async () => {
		fs.mkdirSync("./certs");
		await fs.promises.writeFile("./certs/test.key", "xxxxx");
		expect(() =>
			validateHttpsOptions("./certs/test.key", "./certs/test.pem")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Missing Custom Certificate File at ./certs/test.pem]`
		);
	});

	it("should read the certs from the paths in env vars", async () => {
		fs.mkdirSync("./certs");
		await fs.promises.writeFile("./certs/test.key", "xxxxx");
		await fs.promises.writeFile("./certs/test.pem", "yyyyy");
		vi.stubEnv("WRANGLER_HTTPS_KEY_PATH", "./certs/test.key");
		vi.stubEnv("WRANGLER_HTTPS_CERT_PATH", "./certs/test.pem");
		const options = validateHttpsOptions();
		assert(options);
		expect(options.key).toEqual("xxxxx");
		expect(options.cert).toEqual("yyyyy");
	});

	it("should read the certs from the param paths rather than paths in env vars", async () => {
		fs.mkdirSync("./certs");
		await fs.promises.writeFile("./certs/test-param.key", "xxxxx-param");
		await fs.promises.writeFile("./certs/test-param.pem", "yyyyy-param");
		await fs.promises.writeFile("./certs/test-env.key", "xxxxx-env");
		await fs.promises.writeFile("./certs/test-env.pem", "yyyyy-env");
		vi.stubEnv("WRANGLER_HTTPS_KEY_PATH", "./certs/test-env.key");
		vi.stubEnv("WRANGLER_HTTPS_CERT_PATH", "./certs/test-env.pem");
		const options = validateHttpsOptions(
			"./certs/test-param.key",
			"./certs/test-param.pem"
		);
		assert(options);
		expect(options.key).toEqual("xxxxx-param");
		expect(options.cert).toEqual("yyyyy-param");
	});
});
