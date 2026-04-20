import path from "node:path";
import { describe, it } from "vitest";
import { findWranglerConfig } from "../../src/config/config-helpers";
import {
	mockConsoleMethods,
	normalizeString,
	runInTempDir,
	seed,
} from "../../src/test-helpers";

describe("config findWranglerConfig()", () => {
	runInTempDir();
	const std = mockConsoleMethods();
	const NO_LOGS = { debug: "", err: "", info: "", out: "", warn: "" };

	describe("(useRedirectIfAvailable: false)", () => {
		it.for(["toml", "json", "jsonc"])(
			"should find the nearest wrangler.%s to the reference directory",
			async (ext, { expect }) => {
				await seed({
					[`wrangler.${ext}`]: "DUMMY",
					[`foo/wrangler.${ext}`]: "DUMMY",
					[`foo/bar/wrangler.${ext}`]: "DUMMY",
					[`foo/bar/qux/holder.txt`]: "DUMMY",
				});
				expect(findWranglerConfig(".")).toEqual({
					configPath: path.resolve(`wrangler.${ext}`),
					userConfigPath: path.resolve(`wrangler.${ext}`),
					redirected: false,
				});
				expect(findWranglerConfig("./foo")).toEqual({
					configPath: path.resolve(`foo/wrangler.${ext}`),
					userConfigPath: path.resolve(`foo/wrangler.${ext}`),
					redirected: false,
				});
				expect(findWranglerConfig("./foo/bar")).toEqual({
					configPath: path.resolve(`foo/bar/wrangler.${ext}`),
					userConfigPath: path.resolve(`foo/bar/wrangler.${ext}`),
					redirected: false,
				});
				expect(findWranglerConfig("./foo/bar/qux")).toEqual({
					configPath: path.resolve(`foo/bar/wrangler.${ext}`),
					userConfigPath: path.resolve(`foo/bar/wrangler.${ext}`),
					redirected: false,
				});
				expect(std).toMatchObject(NO_LOGS);
			}
		);

		describe.each([
			["json", "jsonc"],
			["json", "toml"],
			["jsonc", "toml"],
		])("should prefer the wrangler.%s over wrangler.%s", (ext1, ext2) => {
			it("in the same directory", async ({ expect }) => {
				await seed({
					[`wrangler.${ext1}`]: "DUMMY",
					[`wrangler.${ext2}`]: "DUMMY",
				});
				expect(findWranglerConfig(".")).toEqual({
					configPath: path.resolve(`wrangler.${ext1}`),
					userConfigPath: path.resolve(`wrangler.${ext1}`),
					redirected: false,
				});
				expect(std).toMatchObject(NO_LOGS);
			});

			it("in different directories", async ({ expect }) => {
				await seed({
					[`wrangler.${ext1}`]: "DUMMY",
					[`foo/wrangler.${ext2}`]: "DUMMY",
				});
				expect(findWranglerConfig("./foo")).toEqual({
					configPath: path.resolve(`wrangler.${ext1}`),
					userConfigPath: path.resolve(`wrangler.${ext1}`),
					redirected: false,
				});
				expect(std).toMatchObject(NO_LOGS);
			});
		});

		it("should return user config path even if a deploy config is found", async ({
			expect,
		}) => {
			await seed({
				[`wrangler.toml`]: "DUMMY",
				[".wrangler/deploy/config.json"]: `{"configPath": "../../dist/wrangler.json" }`,
				[`dist/wrangler.json`]: "DUMMY",
			});
			expect(findWranglerConfig(".")).toEqual({
				configPath: path.resolve(`wrangler.toml`),
				userConfigPath: path.resolve(`wrangler.toml`),
				redirected: false,
			});
			expect(std).toMatchObject(NO_LOGS);
		});
	});

	describe("(useRedirectIfAvailable: true)", () => {
		it("should return redirected config path if no user config and a deploy config is found", async ({
			expect,
		}) => {
			await seed({
				[".wrangler/deploy/config.json"]: `{"configPath": "../../dist/wrangler.json" }`,
				[`dist/wrangler.json`]: "DUMMY",
				["foo/holder.txt"]: "DUMMY",
			});
			expect(findWranglerConfig(".", { useRedirectIfAvailable: true })).toEqual(
				{
					configPath: path.resolve(`dist/wrangler.json`),
					deployConfigPath: path.resolve(`.wrangler/deploy/config.json`),
					redirected: true,
				}
			);
			expect(
				findWranglerConfig("./foo", { useRedirectIfAvailable: true })
			).toEqual({
				configPath: path.resolve(`dist/wrangler.json`),
				deployConfigPath: path.resolve(`.wrangler/deploy/config.json`),
				redirected: true,
			});
			expect(std).toMatchObject(NO_LOGS);
		});

		it("should return redirected config path if matching user config and a deploy config is found", async ({
			expect,
		}) => {
			await seed({
				[`wrangler.toml`]: "DUMMY",
				[".wrangler/deploy/config.json"]: `{"configPath": "../../dist/wrangler.json" }`,
				[`dist/wrangler.json`]: "DUMMY",
				["foo/holder.txt"]: "DUMMY",
			});
			expect(findWranglerConfig(".", { useRedirectIfAvailable: true })).toEqual(
				{
					configPath: path.resolve(`dist/wrangler.json`),
					userConfigPath: path.resolve(`wrangler.toml`),
					deployConfigPath: path.resolve(`.wrangler/deploy/config.json`),
					redirected: true,
				}
			);
			expect(
				findWranglerConfig("./foo", { useRedirectIfAvailable: true })
			).toEqual({
				configPath: path.resolve(`dist/wrangler.json`),
				userConfigPath: path.resolve(`wrangler.toml`),
				deployConfigPath: path.resolve(`.wrangler/deploy/config.json`),
				redirected: true,
			});
			expect(std).toMatchObject(NO_LOGS);
		});

		it("should error if deploy config is not valid JSON", async ({
			expect,
		}) => {
			await seed({
				[".wrangler/deploy/config.json"]: `INVALID JSON`,
			});

			let error;
			try {
				findWranglerConfig(".", { useRedirectIfAvailable: true });
			} catch (e) {
				error = e;
			}

			expect(normalizeString(`${error}`)).toMatchInlineSnapshot(
				`"Error: Failed to parse the deploy configuration file at .wrangler/deploy/config.json"`
			);
			expect(std).toMatchObject(NO_LOGS);
		});

		it("should error if deploy config does not contain a `configPath` property", async ({
			expect,
		}) => {
			await seed({
				[".wrangler/deploy/config.json"]: `{}`,
			});

			let error;
			try {
				findWranglerConfig(".", { useRedirectIfAvailable: true });
			} catch (e) {
				error = e;
			}

			expect(normalizeString(`${error}`)).toMatchInlineSnapshot(`
				"Error: A deploy configuration file was found at ".wrangler/deploy/config.json".
				But this is not valid - the required "configPath" property was not found.
				Instead this file contains:
				\`\`\`
				{}
				\`\`\`"
			`);
			expect(std).toMatchObject(NO_LOGS);
		});

		it("should error if redirected config file does not exist", async ({
			expect,
		}) => {
			await seed({
				[".wrangler/deploy/config.json"]: `{ "configPath": "missing/wrangler.json" }`,
			});

			let error;
			try {
				findWranglerConfig(".", { useRedirectIfAvailable: true });
			} catch (e) {
				error = e;
			}

			expect(normalizeString(`${error}`)).toMatchInlineSnapshot(`
				"Error: There is a deploy configuration at ".wrangler/deploy/config.json".
				But the redirected configuration path it points to, ".wrangler/deploy/missing/wrangler.json", does not exist."
			`);
			expect(std).toMatchObject(NO_LOGS);
		});

		it("should error if deploy config file and user config file do not have the same base path", async ({
			expect,
		}) => {
			await seed({
				[`foo/wrangler.toml`]: "DUMMY",
				["foo/bar/.wrangler/deploy/config.json"]: `{ "configPath": "../../dist/wrangler.json" }`,
				[`foo/bar/dist/wrangler.json`]: "DUMMY",

				[`bar/foo/wrangler.toml`]: "DUMMY",
				["bar/.wrangler/deploy/config.json"]: `{ "configPath": "../../dist/wrangler.json" }`,
				[`bar/dist/wrangler.json`]: "DUMMY",
			});

			let error;
			try {
				findWranglerConfig("foo/bar", { useRedirectIfAvailable: true });
			} catch (e) {
				error = e;
			}

			expect(normalizeString(`${error}`)).toMatchInlineSnapshot(`
				"Error: Found both a user configuration file at "foo/wrangler.toml"
				and a deploy configuration file at "foo/bar/.wrangler/deploy/config.json".
				But these do not share the same base path so it is not clear which should be used."
			`);
			expect(std).toMatchObject(NO_LOGS);

			try {
				error = undefined;
				findWranglerConfig("bar/foo", { useRedirectIfAvailable: true });
			} catch (e) {
				error = e;
			}

			expect(normalizeString(`${error}`)).toMatchInlineSnapshot(`
				"Error: Found both a user configuration file at "bar/foo/wrangler.toml"
				and a deploy configuration file at "bar/.wrangler/deploy/config.json".
				But these do not share the same base path so it is not clear which should be used."
			`);
			expect(std).toMatchObject(NO_LOGS);
		});
	});
});
