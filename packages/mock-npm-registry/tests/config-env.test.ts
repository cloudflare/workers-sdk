import { describe, test } from "vitest";
import { overrideConfigEnv } from "../src/config-env";

describe("overrideConfigEnv", () => {
	test("writes a canonical variable for each package manager", ({ expect }) => {
		const { env, removed } = overrideConfigEnv(
			{},
			{ "minimum-release-age": "0" }
		);

		expect(env).toEqual({
			npm_config_minimum_release_age: "0",
			pnpm_config_minimum_release_age: "0",
		});
		expect(removed).toEqual([]);
	});

	test("replaces an inherited value", ({ expect }) => {
		const { env, removed } = overrideConfigEnv(
			{ npm_config_minimum_release_age: "1440" },
			{ "minimum-release-age": "0" }
		);

		expect(env.npm_config_minimum_release_age).toBe("0");
		expect(removed).toEqual(["npm_config_minimum_release_age"]);
	});

	const spellings = {
		"upper case": "NPM_CONFIG_MINIMUM_RELEASE_AGE",
		"mixed case": "npm_config_MINIMUM_release_AGE",
		"camel case": "npm_config_minimumReleaseAge",
		"pnpm prefix": "pnpm_config_minimum_release_age",
		"pnpm prefix, upper case": "PNPM_CONFIG_MINIMUM_RELEASE_AGE",
	};

	for (const [spelling, key] of Object.entries(spellings)) {
		test(`replaces an inherited value spelled in ${spelling}`, ({ expect }) => {
			const { env, removed } = overrideConfigEnv(
				{ [key]: "1440" },
				{ "minimum-release-age": "0" }
			);

			expect(removed).toEqual([key]);
			expect(Object.values(env)).not.toContain("1440");
			expect(env).toEqual({
				npm_config_minimum_release_age: "0",
				pnpm_config_minimum_release_age: "0",
			});
		});
	}

	test("removes every spelling when several are inherited at once", ({
		expect,
	}) => {
		// The case that broke C3's E2E tests on Windows: pnpm reads whichever
		// spelling the environment block happens to order last.
		const { env, removed } = overrideConfigEnv(
			{
				NPM_CONFIG_MINIMUM_RELEASE_AGE: "1440",
				npm_config_minimum_release_age: "1440",
				npm_config_minimumReleaseAge: "1440",
			},
			{ "minimum-release-age": "0" }
		);

		expect(removed).toEqual([
			"NPM_CONFIG_MINIMUM_RELEASE_AGE",
			"npm_config_minimum_release_age",
			"npm_config_minimumReleaseAge",
		]);
		expect(env).toEqual({
			npm_config_minimum_release_age: "0",
			pnpm_config_minimum_release_age: "0",
		});
	});

	test("applies several overrides at once", ({ expect }) => {
		const { env, removed } = overrideConfigEnv(
			{
				NPM_CONFIG_CACHE: "/global/cache",
				npm_config_minimum_release_age: "1440",
			},
			{ "minimum-release-age": "0", cache: "./.npm/cache" }
		);

		expect(removed).toEqual([
			"NPM_CONFIG_CACHE",
			"npm_config_minimum_release_age",
		]);
		expect(env).toEqual({
			npm_config_minimum_release_age: "0",
			pnpm_config_minimum_release_age: "0",
			npm_config_cache: "./.npm/cache",
			pnpm_config_cache: "./.npm/cache",
		});
	});

	test("leaves other configuration alone", ({ expect }) => {
		const { env, removed } = overrideConfigEnv(
			{
				PATH: "/usr/bin",
				npm_config_registry: "http://localhost:1234",
				NPM_CONFIG_USERCONFIG: "/tmp/.npmrc",
				npm_config_user_agent: "pnpm/10.33.0",
			},
			{ "minimum-release-age": "0" }
		);

		expect(removed).toEqual([]);
		expect(env).toMatchObject({
			PATH: "/usr/bin",
			npm_config_registry: "http://localhost:1234",
			NPM_CONFIG_USERCONFIG: "/tmp/.npmrc",
			npm_config_user_agent: "pnpm/10.33.0",
		});
	});

	test("matches settings exactly, not by prefix", ({ expect }) => {
		// `cache-dir` is a distinct pnpm setting from `cache`, and
		// `minimum-release-age-strict` from `minimum-release-age`.
		const { env, removed } = overrideConfigEnv(
			{
				npm_config_cache_dir: "/global/pnpm-cache",
				npm_config_minimum_release_age_strict: "true",
			},
			{ "minimum-release-age": "0", cache: "./.npm/cache" }
		);

		expect(removed).toEqual([]);
		expect(env).toMatchObject({
			npm_config_cache_dir: "/global/pnpm-cache",
			npm_config_minimum_release_age_strict: "true",
		});
	});

	test("does not mutate the environment it is given", ({ expect }) => {
		const original = { npm_config_minimum_release_age: "1440" };

		overrideConfigEnv(original, { "minimum-release-age": "0" });

		expect(original).toEqual({ npm_config_minimum_release_age: "1440" });
	});
});
