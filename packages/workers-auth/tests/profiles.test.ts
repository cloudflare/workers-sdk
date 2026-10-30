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

	it("prefers an explicit profile to the environment", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "work");

		expect(profiles.resolve({ profile: "other", cwd: process.cwd() })).toBe(
			"other"
		);
		expect(profiles.resolve({ profile: "default", cwd: process.cwd() })).toBe(
			"default"
		);
	});

	it("prefers the environment to directory bindings", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "work");

		expect(profiles.resolve({ cwd: process.cwd() })).toBe("work");
	});

	it("allows the environment to select the default profile", ({ expect }) => {
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "default");

		expect(profiles.resolve({ cwd: process.cwd() })).toBe("default");
	});

	it.for([undefined, ""])(
		"uses directory bindings when the environment is %j",
		(profile, { expect }) => {
			vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", profile);

			expect(profiles.resolve({ cwd: process.cwd() })).toBe("personal");
		}
	);

	it("falls back to default without an override or binding", ({ expect }) => {
		expect(profiles.resolve({ cwd: path.dirname(process.cwd()) })).toBe(
			"default"
		);
	});

	it.for(["../work", "my profile", "staging"])(
		"validates the environment profile %s",
		(profile, { expect }) => {
			vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", profile);

			expect(() => profiles.resolve({ cwd: process.cwd() })).toThrow(
				/profile name/i
			);
		}
	);

	it("ignores an invalid environment override when an explicit profile is given", ({
		expect,
	}) => {
		vi.stubEnv("CLOUDFLARE_AUTH_PROFILE", "../invalid");

		expect(profiles.resolve({ profile: "work", cwd: process.cwd() })).toBe(
			"work"
		);
	});
});
