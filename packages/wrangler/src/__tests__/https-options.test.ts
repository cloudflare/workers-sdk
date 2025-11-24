import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getGlobalWranglerConfigPath } from "@cloudflare/workers-utils";
import { getHttpsOptions } from "../https-options";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";

vi.mock("node:fs", async (importOriginal) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports
	const fsOriginal = await importOriginal<typeof import("node:fs")>();
	return { ...fsOriginal };
});

describe("getHttpsOptions()", () => {
	runInTempDir();
	const std = mockConsoleMethods();

	it("should use cached values if they have not expired", async () => {
		fs.mkdirSync(path.resolve(getGlobalWranglerConfigPath(), "local-cert"), {
			recursive: true,
		});
		fs.writeFileSync(
			path.resolve(getGlobalWranglerConfigPath(), "local-cert/key.pem"),
			"PRIVATE KEY"
		);
		fs.writeFileSync(
			path.resolve(getGlobalWranglerConfigPath(), "local-cert/cert.pem"),
			"PUBLIC KEY"
		);
		const result = await getHttpsOptions();
		expect(result.key).toEqual("PRIVATE KEY");
		expect(result.cert).toEqual("PUBLIC KEY");
		expect(std.out).toMatchInlineSnapshot(`""`);
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should generate and cache new keys if none are cached", async () => {
		const result = await getHttpsOptions();
		const key = fs.readFileSync(
			path.resolve(getGlobalWranglerConfigPath(), "local-cert/key.pem"),
			"utf8"
		);
		const cert = fs.readFileSync(
			path.resolve(getGlobalWranglerConfigPath(), "local-cert/cert.pem"),
			"utf8"
		);
		expect(result.key).toEqual(key);
		expect(result.cert).toEqual(cert);
		expect(std.out).toMatchInlineSnapshot(
			`"Generating new self-signed certificate..."`
		);
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should generate and cache new keys if cached files have expired", async () => {
		fs.mkdirSync(path.resolve(getGlobalWranglerConfigPath(), "local-cert"), {
			recursive: true,
		});
		const ORIGINAL_KEY = "EXPIRED PRIVATE KEY";
		const ORIGINAL_CERT = "EXPIRED PUBLIC KEY";

		const old = new Date(2000);
		fs.writeFileSync(
			path.resolve(getGlobalWranglerConfigPath(), "local-cert/key.pem"),
			ORIGINAL_KEY
		);
		fs.utimesSync(
			path.resolve(getGlobalWranglerConfigPath(), "local-cert/key.pem"),
			old,
			old
		);
		fs.writeFileSync(
			path.resolve(getGlobalWranglerConfigPath(), "local-cert/cert.pem"),
			ORIGINAL_CERT
		);
		fs.utimesSync(
			path.resolve(getGlobalWranglerConfigPath(), "local-cert/cert.pem"),
			old,
			old
		);

		const result = await getHttpsOptions();
		const key = fs.readFileSync(
			path.resolve(getGlobalWranglerConfigPath(), "local-cert/key.pem"),
			"utf8"
		);
		const cert = fs.readFileSync(
			path.resolve(getGlobalWranglerConfigPath(), "local-cert/cert.pem"),
			"utf8"
		);
		expect(key).not.toEqual(ORIGINAL_KEY);
		expect(cert).not.toEqual(ORIGINAL_CERT);
		expect(result.key).toEqual(key);
		expect(result.cert).toEqual(cert);
		expect(std.out).toMatchInlineSnapshot(
			`"Generating new self-signed certificate..."`
		);
		expect(std.warn).toMatchInlineSnapshot(`""`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should warn if not able to write to the cache (legacy config path)", async () => {
		fs.mkdirSync(path.join(os.homedir(), ".wrangler"));
		await mockWriteFileSyncThrow(/\.pem$/);
		await getHttpsOptions();
		expect(
			fs.existsSync(
				path.resolve(getGlobalWranglerConfigPath(), "local-cert/key.pem")
			)
		).toBe(false);
		expect(
			fs.existsSync(
				path.resolve(getGlobalWranglerConfigPath(), "local-cert/cert.pem")
			)
		).toBe(false);
		expect(std.out).toMatchInlineSnapshot(
			`"Generating new self-signed certificate..."`
		);
		expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mUnable to cache generated self-signed certificate in home/.wrangler/local-cert.[0m

			  ERROR: Cannot write file

			"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
		fs.rmSync(path.join(os.homedir(), ".wrangler"), { recursive: true });
	});

	it("should warn if not able to write to the cache", async () => {
		await mockWriteFileSyncThrow(/\.pem$/);

		await getHttpsOptions();
		expect(
			fs.existsSync(
				path.resolve(getGlobalWranglerConfigPath(), "local-cert/key.pem")
			)
		).toBe(false);
		expect(
			fs.existsSync(
				path.resolve(getGlobalWranglerConfigPath(), "local-cert/cert.pem")
			)
		).toBe(false);
		expect(std.out).toMatchInlineSnapshot(
			`"Generating new self-signed certificate..."`
		);
		expect(std.warn).toMatchInlineSnapshot(`
			"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mUnable to cache generated self-signed certificate in home/.config/.wrangler/local-cert.[0m

			  ERROR: Cannot write file

			"
		`);
		expect(std.err).toMatchInlineSnapshot(`""`);
	});

	it("should read the certs from the paths if provided", async () => {
		fs.mkdirSync("./certs");
		await fs.promises.writeFile("./certs/test.key", "xxxxx");
		await fs.promises.writeFile("./certs/test.pem", "yyyyy");
		const options = getHttpsOptions("./certs/test.key", "./certs/test.pem");
		expect(options.key).toEqual("xxxxx");
		expect(options.cert).toEqual("yyyyy");
	});

	it("should error if only one of the two paths is provided", async () => {
		expect(() =>
			getHttpsOptions("./certs/test.key", undefined)
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Must specify both certificate path and key path to use a Custom Certificate.]`
		);
		expect(() =>
			getHttpsOptions(undefined, "./certs/test.pem")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Must specify both certificate path and key path to use a Custom Certificate.]`
		);
	});

	it("should error if the key file does not exist", async () => {
		fs.mkdirSync("./certs");
		await fs.promises.writeFile("./certs/test.pem", "yyyyy");
		expect(() =>
			getHttpsOptions("./certs/test.key", "./certs/test.pem")
		).toThrowErrorMatchingInlineSnapshot(
			`[Error: Missing Custom Certificate Key at ./certs/test.key]`
		);
	});

	it("should error if the cert file does not exist", async () => {
		fs.mkdirSync("./certs");
		await fs.promises.writeFile("./certs/test.key", "xxxxx");
		expect(() =>
			getHttpsOptions("./certs/test.key", "./certs/test.pem")
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
		const options = getHttpsOptions();
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
		const options = getHttpsOptions(
			"./certs/test-param.key",
			"./certs/test-param.pem"
		);
		expect(options.key).toEqual("xxxxx-param");
		expect(options.cert).toEqual("yyyyy-param");
	});
});

async function mockWriteFileSyncThrow(matcher: RegExp) {
	const originalWriteFileSync =
		// eslint-disable-next-line @typescript-eslint/consistent-type-imports
		(await vi.importActual<typeof import("node:fs")>("node:fs")).writeFileSync;
	vi.spyOn(fs, "writeFileSync").mockImplementation(
		(filePath, data, options) => {
			if (matcher.test(filePath.toString())) {
				throw new Error("ERROR: Cannot write file");
			} else {
				return originalWriteFileSync(filePath, data, options);
			}
		}
	);
}
