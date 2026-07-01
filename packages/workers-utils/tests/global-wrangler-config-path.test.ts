import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import {
	getGlobalConfigPath,
	getGlobalWranglerCachePath,
	getGlobalWranglerConfigPath,
} from "@cloudflare/workers-utils";
import { runInTempDir } from "../src/test-helpers";

describe("getGlobalWranglerConfigPath", () => {
	runInTempDir();

	it("returns the XDG config path when no legacy ~/.wrangler directory exists", ({
		expect,
	}) => {
		const result = getGlobalWranglerConfigPath();
		expect(result).not.toBe(path.join(os.homedir(), ".wrangler"));
		expect(result).toContain(path.join(".config", ".wrangler"));
	});

	it("returns the legacy ~/.wrangler path when that directory exists", ({
		expect,
	}) => {
		const legacyDir = path.join(os.homedir(), ".wrangler");
		fs.mkdirSync(legacyDir, { recursive: true });

		const result = getGlobalWranglerConfigPath();
		expect(result).toBe(legacyDir);
	});
});

describe("getGlobalConfigPath", () => {
	runInTempDir();

	it("returns path with custom appName and leading dot", ({ expect }) => {
		const result = getGlobalConfigPath({ appName: "test-app", leadingDot: true });
		expect(result).toContain(".test-app");
	});

	it("returns path without leading dot when leadingDot is false", ({
		expect,
	}) => {
		const result = getGlobalConfigPath({
			appName: "test-app",
			leadingDot: false,
		});
		expect(result).not.toContain(".test-app");
		expect(result).toContain("test-app");
	});

	it("respects useLegacyHomeDir: false to always use XDG path", ({
		expect,
	}) => {
		const legacyDir = path.join(os.homedir(), ".wrangler");
		fs.mkdirSync(legacyDir, { recursive: true });

		const result = getGlobalConfigPath({ useLegacyHomeDir: false });
		expect(result).not.toBe(legacyDir);
	});

	it("uses legacy home dir when it exists and useLegacyHomeDir is true", ({
		expect,
	}) => {
		const legacyDir = path.join(os.homedir(), ".custom-app");
		fs.mkdirSync(legacyDir, { recursive: true });

		const result = getGlobalConfigPath({
			appName: "custom-app",
			useLegacyHomeDir: true,
		});
		expect(result).toBe(legacyDir);
	});
});

describe("getGlobalWranglerCachePath", () => {
	it("returns a non-empty cache path containing .wrangler", ({ expect }) => {
		const result = getGlobalWranglerCachePath();
		expect(result).toBeTruthy();
		expect(result).toContain(".wrangler");
	});
});
