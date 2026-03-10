import { describe, test } from "vitest";
import {
	isAllowedExistingFile,
	validateProjectDirectory,
	validateTemplateUrl,
} from "../validators";

describe("validators", () => {
	describe("validateProjectDirectory", () => {
		let args = {};

		test("allow valid project names", async ({ expect }) => {
			expect(validateProjectDirectory("foo", args)).toBeUndefined();
			expect(validateProjectDirectory("foo/bar/baz", args)).toBeUndefined();
			expect(validateProjectDirectory("./foobar", args)).toBeUndefined();
			expect(validateProjectDirectory("f".repeat(58), args)).toBeUndefined();
		});

		test("disallow invalid project names", async ({ expect }) => {
			// Invalid pages project names should return an error
			expect(validateProjectDirectory("foobar-", args)).not.toBeUndefined();
			expect(validateProjectDirectory("-foobar-", args)).not.toBeUndefined();
			expect(validateProjectDirectory("fo*o{ba)r", args)).not.toBeUndefined();
			expect(
				validateProjectDirectory("f".repeat(59), args),
			).not.toBeUndefined();
		});

		test("disallow existing, non-empty directories", async ({ expect }) => {
			// Existing, non-empty directories should return an error
			expect(validateProjectDirectory(".", args)).not.toBeUndefined();
		});

		test("Relax validation when --existing-script is passed", async ({
			expect,
		}) => {
			args = { existingScript: "FooBar" };
			expect(validateProjectDirectory("foobar-", args)).toBeUndefined();
			expect(validateProjectDirectory("FooBar", args)).toBeUndefined();
			expect(validateProjectDirectory("f".repeat(59), args)).toBeUndefined();
		});
	});

	describe("isAllowedExistingFile", () => {
		const allowed = [
			"LICENSE",
			"LICENSE.md",
			"license",
			".npmignore",
			".git",
			".DS_Store",
		];
		test.for(allowed)("%s", (val, { expect }) => {
			expect(isAllowedExistingFile(val)).toBe(true);
		});

		const disallowed = ["foobar", "potato"];
		test.for(disallowed)("%s", (val, { expect }) => {
			expect(isAllowedExistingFile(val)).toBe(false);
		});
	});

	describe("validateTemplateUrl", () => {
		const allowed = [
			"https://github.com/cloudflare/workers-sdk/templates/foo",
			"cloudflare/workers-sdk/templates/foo",
			"user/my-template",
			"user/my-template#experimental",
			"user/my-template#99bf5f8653bd026555cceffa61ee9120eb2c4645",
			"git@github.com:user/my-template.git",
			"bitbucket:user/my-template",
			"gitlab:user/my-template",
		];

		test.for(allowed)("%s", (val, { expect }) => {
			expect(validateTemplateUrl(val)).toBeUndefined();
		});

		const disallowed = [
			"potato",
			"http://foo.com/user/my-template",
			"ftp://foo.com/user/my-template",
		];

		test.for(disallowed)("%s", (val, { expect }) => {
			expect(validateTemplateUrl(val)).toEqual(expect.any(String));
		});
	});
});
