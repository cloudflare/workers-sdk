import path from "node:path";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { createCfProfileStore } from "../src/cf";
import { createWranglerProfileStore } from "../src/wrangler";
import type { ProfileStore } from "../src/profiles";

describe.each([
	{ name: "cf", createStore: createCfProfileStore },
	{ name: "Wrangler", createStore: createWranglerProfileStore },
])("$name profile resolution", ({ createStore }) => {
	runInTempDir();
	let profiles: ProfileStore;

	beforeEach(() => {
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", undefined);
		profiles = createStore({
			logger: {
				debug: vi.fn(),
				log: vi.fn(),
				info: vi.fn(),
				warn: vi.fn(),
				error: vi.fn(),
			},
		});
		profiles.bindings.activate("personal", process.cwd());
	});

	it("should prefer an explicit profile over the environment", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "work");

		expect(profiles.resolve({ profile: "other", cwd: process.cwd() })).toBe(
			"other"
		);
		expect(profiles.resolve({ profile: "default", cwd: process.cwd() })).toBe(
			"default"
		);
	});

	it("should prefer the environment over directory bindings", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "work");

		expect(profiles.resolve({ cwd: process.cwd() })).toBe("work");
	});

	it("should select the default profile from the environment", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "default");

		expect(profiles.resolve({ cwd: process.cwd() })).toBe("default");
	});

	it.for([undefined, ""])(
		"should use directory bindings with environment profile %j",
		(profile, { expect }) => {
			vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", profile);

			expect(profiles.resolve({ cwd: process.cwd() })).toBe("personal");
		}
	);

	it("should fall back to default without an override or binding", ({
		expect,
	}) => {
		expect(profiles.resolve({ cwd: path.dirname(process.cwd()) })).toBe(
			"default"
		);
	});

	it.for(["../work", "my profile", "staging"])(
		"should reject invalid environment profile %s",
		(profile, { expect }) => {
			vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", profile);

			expect(() => profiles.resolve({ cwd: process.cwd() })).toThrow(
				/profile name/i
			);
		}
	);

	it("should ignore an invalid environment override when the caller selects an explicit profile", ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "../invalid");

		expect(profiles.resolve({ profile: "work", cwd: process.cwd() })).toBe(
			"work"
		);
	});

	describe("global active profile", () => {
		it("should be ignored while a directory binding applies", ({ expect }) => {
			vi.spyOn(profiles.configs, "exists").mockReturnValue(true);
			profiles.global.use("work");

			expect(profiles.resolveWithSource({ cwd: process.cwd() })).toMatchObject({
				profile: "personal",
				source: "directory",
			});
		});

		it("should apply outside bound directories, before the default", ({
			expect,
		}) => {
			vi.spyOn(profiles.configs, "exists").mockReturnValue(true);
			const outside = path.dirname(process.cwd());

			expect(profiles.resolveWithSource({ cwd: outside })).toEqual({
				profile: "default",
				source: "default",
			});

			profiles.global.use("work");

			expect(profiles.resolve({ cwd: outside })).toBe("work");
			expect(profiles.resolveWithSource({ cwd: outside })).toEqual({
				profile: "work",
				source: "global",
			});
		});

		it("should lose to the environment and the explicit flag", ({ expect }) => {
			vi.spyOn(profiles.configs, "exists").mockReturnValue(true);
			profiles.global.use("work");
			const outside = path.dirname(process.cwd());

			vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "env-profile");
			expect(profiles.resolveWithSource({ cwd: outside })).toEqual({
				profile: "env-profile",
				source: "env",
			});
			expect(
				profiles.resolveWithSource({ profile: "flag-profile", cwd: outside })
			).toEqual({ profile: "flag-profile", source: "flag" });
		});

		it('should be cleared by `use("default")` / `use(undefined)`', ({
			expect,
		}) => {
			vi.spyOn(profiles.configs, "exists").mockReturnValue(true);
			profiles.global.use("work");
			expect(profiles.global.read()).toBe("work");

			profiles.global.use("default");
			expect(profiles.global.read()).toBeUndefined();

			profiles.global.use("work");
			profiles.global.use(undefined);
			expect(profiles.global.read()).toBeUndefined();
		});

		it("should reject reserved or invalid names", ({ expect }) => {
			expect(() => profiles.global.use("staging")).toThrow(/reserved/);
			expect(() => profiles.global.use("../work")).toThrow(/profile name/i);
		});

		it("should ignore a stored profile whose credentials no longer exist", ({
			expect,
		}) => {
			const exists = vi.spyOn(profiles.configs, "exists");
			exists.mockReturnValue(true);
			profiles.global.use("work");

			exists.mockReturnValue(false);
			expect(profiles.global.read()).toBe("work");
			expect(profiles.global.get()).toBeUndefined();
			expect(profiles.resolve({ cwd: path.dirname(process.cwd()) })).toBe(
				"default"
			);
		});

		it("should persist across store instances", ({ expect }) => {
			vi.spyOn(profiles.configs, "exists").mockReturnValue(true);
			profiles.global.use("work");

			const fresh = createStore({
				logger: {
					debug: vi.fn(),
					log: vi.fn(),
					info: vi.fn(),
					warn: vi.fn(),
					error: vi.fn(),
				},
			});
			expect(fresh.global.read()).toBe("work");
		});

		it("should fall back to the global profile after deactivating a directory", ({
			expect,
		}) => {
			vi.spyOn(profiles.configs, "exists").mockReturnValue(true);
			profiles.global.use("work");

			expect(profiles.bindings.deactivate(process.cwd())).toEqual({
				removedProfile: "personal",
				newResolution: { profile: "work", source: "global active profile" },
			});
		});
	});
});
