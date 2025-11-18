import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import xdgAppPaths from "xdg-app-paths";
import {
	getGlobalWranglerCachePath,
	getGlobalWranglerConfigPath,
} from "../src/xdg-app-paths";
import { runInTempDir } from "./helpers/run-in-tmp";

describe("getGlobalWranglerCachePath()", () => {
	runInTempDir();

	it('should use XDG "wrangler" cache path by default', () => {
		const cachePath = xdgAppPaths({ name: "wrangler" }).cache();
		expect(getGlobalWranglerCachePath()).toEqual(cachePath);
	});

	it('should migrate from XDG ".wrangler" cache path if it exists', () => {
		const dottedCachePath = xdgAppPaths({ name: ".wrangler" }).cache();
		const cachePath = xdgAppPaths({ name: "wrangler" }).cache();
		fs.mkdirSync(dottedCachePath, { recursive: true });
		fs.writeFileSync(path.join(dottedCachePath, "test.txt"), "test");

		expect(getGlobalWranglerCachePath()).toEqual(cachePath);
		expect(fs.existsSync(dottedCachePath)).toBe(false);
		expect(fs.existsSync(path.join(cachePath, "test.txt"))).toBeTruthy();
	});

	it('should not migrate from XDG ".wrangler" cache path if it is not possible to move it', () => {
		const dottedCachePath = xdgAppPaths({ name: ".wrangler" }).cache();
		const cachePath = xdgAppPaths({ name: "wrangler" }).cache();
		fs.mkdirSync(dottedCachePath, { recursive: true });
		fs.writeFileSync(path.join(dottedCachePath, "test.txt"), "test");
		vi.spyOn(fs, "renameSync").mockImplementation(() => {
			throw new Error("Cannot move directory");
		});

		expect(getGlobalWranglerCachePath()).toEqual(dottedCachePath);
		expect(fs.existsSync(cachePath)).toBe(false);
		expect(fs.existsSync(dottedCachePath)).toBe(true);
		expect(fs.existsSync(path.join(dottedCachePath, "test.txt"))).toBeTruthy();
	});
});

describe("getGlobalWranglerConfigPath()", () => {
	runInTempDir();

	it('should use XDG "wrangler" config path by default', () => {
		const configPath = xdgAppPaths({ name: "wrangler" }).config();
		expect(getGlobalWranglerConfigPath()).toEqual(configPath);
	});

	it('should migrate from XDG ".wrangler" config path if it exists', () => {
		const dottedConfigPath = xdgAppPaths({ name: ".wrangler" }).config();
		const configPath = xdgAppPaths({ name: "wrangler" }).config();
		fs.mkdirSync(dottedConfigPath, { recursive: true });
		fs.writeFileSync(path.join(dottedConfigPath, "test.txt"), "test");

		expect(getGlobalWranglerConfigPath()).toEqual(configPath);
		expect(fs.existsSync(dottedConfigPath)).toBe(false);
		expect(fs.existsSync(path.join(configPath, "test.txt"))).toBeTruthy();
	});

	it('should not migrate from XDG ".wrangler" config path if it is not possible to move it', () => {
		const dottedConfigPath = xdgAppPaths({ name: ".wrangler" }).config();
		const configPath = xdgAppPaths({ name: "wrangler" }).config();
		fs.mkdirSync(dottedConfigPath, { recursive: true });
		fs.writeFileSync(path.join(dottedConfigPath, "test.txt"), "test");
		vi.spyOn(fs, "renameSync").mockImplementation(() => {
			throw new Error("Cannot move directory");
		});

		expect(getGlobalWranglerConfigPath()).toEqual(dottedConfigPath);
		expect(fs.existsSync(configPath)).toBe(false);
		expect(fs.existsSync(dottedConfigPath)).toBe(true);
		expect(fs.existsSync(path.join(dottedConfigPath, "test.txt"))).toBeTruthy();
	});

	it('should migrate from legacy "~/.wrangler" config path if it exists', () => {
		const legacyConfigPath = path.resolve(os.homedir(), ".wrangler");
		const configPath = xdgAppPaths({ name: "wrangler" }).config();
		fs.mkdirSync(legacyConfigPath, { recursive: true });
		fs.writeFileSync(path.join(legacyConfigPath, "test.txt"), "test");

		expect(getGlobalWranglerConfigPath()).toEqual(configPath);
		expect(fs.existsSync(legacyConfigPath)).toBe(false);
		expect(fs.existsSync(path.join(configPath, "test.txt"))).toBeTruthy();
	});

	it('should not migrate from legacy "~/.wrangler" config path if it is not possible to move it', () => {
		const legacyConfigPath = path.resolve(os.homedir(), ".wrangler");
		const configPath = xdgAppPaths({ name: "wrangler" }).config();
		fs.mkdirSync(legacyConfigPath, { recursive: true });
		fs.writeFileSync(path.join(legacyConfigPath, "test.txt"), "test");
		vi.spyOn(fs, "renameSync").mockImplementation(() => {
			throw new Error("Cannot move directory");
		});

		expect(getGlobalWranglerConfigPath()).toEqual(legacyConfigPath);
		expect(fs.existsSync(configPath)).toBe(false);
		expect(fs.existsSync(legacyConfigPath)).toBe(true);
		expect(fs.existsSync(path.join(legacyConfigPath, "test.txt"))).toBeTruthy();
	});
});
