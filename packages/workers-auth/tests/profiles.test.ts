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
});
