import { existsSync, readdirSync } from "fs";
import { getWorkerdCompatibilityDate } from "helpers/command";
import { readFile, writeFile } from "helpers/files";
import { describe, expect, test, vi, afterEach, beforeEach } from "vitest";
import {
	addWorkersTypesToTsConfig,
	getLatestTypesEntrypoint,
} from "../workers";
import { updateWranglerToml } from "../workers";
import { createTestContext } from "./helpers";
import type { Dirent } from "fs";
import type { C3Context } from "types";

vi.mock("helpers/files");
vi.mock("helpers/command");

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

		const entrypoint = getLatestTypesEntrypoint(ctx);
		expect(entrypoint).toBe("2023-07-01");
	});

	test("read error", async () => {
		vi.mocked(readdirSync).mockImplementation(() => {
			throw new Error("ENOENT: no such file or directory");
		});

		const entrypoint = getLatestTypesEntrypoint(ctx);
		expect(entrypoint).toBe(null);
	});

	test("empty directory", async () => {
		vi.mocked(readdirSync).mockImplementation(() => []);

		const entrypoint = getLatestTypesEntrypoint(ctx);
		expect(entrypoint).toBe(null);
	});

	test("no compat dates found", async () => {
		vi.mocked(readdirSync).mockImplementation(
			() => ["foo", "bar"] as unknown as Dirent[]
		);

		const entrypoint = getLatestTypesEntrypoint(ctx);
		expect(entrypoint).toBe(null);
	});
});

describe("addWorkersTypesToTsConfig", () => {
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
		await addWorkersTypesToTsConfig(ctx);

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

describe("updateWranglerToml", () => {
	const ctx = createTestContext();

	const mockCompatDate = "2024-01-17";
	vi.mocked(getWorkerdCompatibilityDate).mockReturnValue(
		Promise.resolve(mockCompatDate)
	);

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("placeholder replacement", async () => {
		const toml = [
			`name = "<TBD>"`,
			`main = "src/index.ts"`,
			`compatibility_date = "<TBD>"`,
		].join("\n");
		vi.mocked(readFile).mockReturnValue(toml);

		await updateWranglerToml(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatch(`name = "${ctx.project.name}"`);
		expect(newToml).toMatch(`main = "src/index.ts"`);
		expect(newToml).toMatch(`compatibility_date = "${mockCompatDate}"`);
	});

	test("empty replacement", async () => {
		const toml = [
			`name = `,
			`main = "src/index.ts"`,
			`compatibility_date = `,
		].join("\n");
		vi.mocked(readFile).mockReturnValue(toml);

		await updateWranglerToml(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatch(`name = "${ctx.project.name}"`);
		expect(newToml).toMatch(`main = "src/index.ts"`);
		expect(newToml).toMatch(`compatibility_date = "${mockCompatDate}"`);
	});

	test("string literal replacement", async () => {
		const toml = [`name = "my-cool-worker"`, `main = "src/index.ts"`].join(
			"\n"
		);
		vi.mocked(readFile).mockReturnValue(toml);

		await updateWranglerToml(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatch(`name = "${ctx.project.name}"`);
		expect(newToml).toMatch(`main = "src/index.ts"`);
	});

	test("missing name and compat date", async () => {
		const toml = `main = "src/index.ts"`;
		vi.mocked(readFile).mockReturnValue(toml);

		await updateWranglerToml(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatch(`name = "${ctx.project.name}"`);
		expect(newToml).toMatch(`main = "src/index.ts"`);
		expect(newToml).toMatch(`compatibility_date = "${mockCompatDate}"`);
	});

	test("dont replace valid existing compatibility date", async () => {
		const toml = [
			`name = "super-old-worker"`,
			`compatibility_date = "2001-10-12"`,
		].join("\n");
		vi.mocked(readFile).mockReturnValue(toml);

		await updateWranglerToml(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatch(`compatibility_date = "2001-10-12"`);
	});
});
