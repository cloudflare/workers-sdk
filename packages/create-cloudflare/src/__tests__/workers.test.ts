import { existsSync, readdirSync } from "fs";
import { readFile, writeFile } from "helpers/files";
import { describe, expect, test, vi, afterEach, beforeEach } from "vitest";
import * as workers from "../workers";
import { createTestContext } from "./helpers";
import type { Dirent } from "fs";
import type { C3Context } from "types";

const mockWorkersTypesDirListing = [
	"2021-11-03",
	"2022-03-21",
	"2022-11-30",
	"2023-03-01",
	"2023-07-01",
	"experimental",
	"index.d.ts",
	"index.ts",
	"oldest",
	"package.json",
];

vi.mock("fs");
vi.mock("helpers/files");

describe("getLatestTypesEntrypoint", () => {
	const ctx = createTestContext();

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("happy path", async () => {
		vi.mocked(readdirSync).mockImplementation(
			// vitest won't resolve the type for the correct overload thus the trickery
			() => [...mockWorkersTypesDirListing] as unknown as Dirent[]
		);

		const entrypoint = workers.getLatestTypesEntrypoint(ctx);
		expect(entrypoint).toBe("2023-07-01");
	});

	test("read error", async () => {
		vi.mocked(readdirSync).mockImplementation(() => {
			throw new Error("ENOENT: no such file or directory");
		});

		const entrypoint = workers.getLatestTypesEntrypoint(ctx);
		expect(entrypoint).toBe(null);
	});

	test("empty directory", async () => {
		vi.mocked(readdirSync).mockImplementation(() => []);

		const entrypoint = workers.getLatestTypesEntrypoint(ctx);
		expect(entrypoint).toBe(null);
	});

	test("no compat dates found", async () => {
		vi.mocked(readdirSync).mockImplementation(
			() => ["foo", "bar"] as unknown as Dirent[]
		);

		const entrypoint = workers.getLatestTypesEntrypoint(ctx);
		expect(entrypoint).toBe(null);
	});
});

describe("updateTsConfig", () => {
	let ctx: C3Context;

	beforeEach(() => {
		ctx = createTestContext();

		ctx.args.ts = true;
		vi.mocked(existsSync).mockImplementation(() => true);
		// mock getLatestTypesEntrypoint
		vi.mocked(readdirSync).mockImplementation(
			() => ["2023-07-01"] as unknown as Dirent[]
		);

		// Mock the read of tsconfig.json
		vi.mocked(readFile).mockImplementation(
			() => `{types: ["@cloudflare/workers-types"]}`
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("happy path", async () => {
		await workers.updateTsConfig(ctx);

		expect(vi.mocked(writeFile).mock.calls[0][1]).toEqual(
			`{types: ["@cloudflare/workers-types/2023-07-01"]}`
		);
	});

	test("not using ts", async () => {
		ctx.args.ts = false;
		expect(writeFile).not.toHaveBeenCalled();
	});

	test("tsconfig.json not found", async () => {
		vi.mocked(existsSync).mockImplementation(() => false);
		expect(writeFile).not.toHaveBeenCalled();
	});

	test("latest entrypoint not found", async () => {
		vi.mocked(readdirSync).mockImplementation(
			() => ["README.md"] as unknown as Dirent[]
		);

		expect(writeFile).not.toHaveBeenCalled();
	});
});
