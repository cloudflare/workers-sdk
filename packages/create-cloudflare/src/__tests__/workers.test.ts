import { existsSync, readdirSync } from "fs";
import { getWorkerdCompatibilityDate } from "helpers/command";
import { readFile, writeFile } from "helpers/files";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
	addWorkersTypesToTsConfig,
	getLatestTypesEntrypoint,
	updateWranglerToml,
} from "../workers";
import { createTestContext } from "./helpers";
import type { Dirent } from "fs";
import type { C3Context } from "types";

vi.mock("helpers/files");
vi.mock("helpers/command");
vi.mock("fs");

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

const mockWorkersTypesDirectory = (
	mockImpl: () => string[] = () => [...mockWorkersTypesDirListing]
) => {
	vi.mocked(readdirSync).mockImplementation((path) => {
		if (path.toString().match("workers-types")) {
			// vitest won't resolve the type for the correct `readdirSync` overload thus the trickery
			return mockImpl() as unknown as Dirent[];
		}
		return [];
	});
};

describe("getLatestTypesEntrypoint", () => {
	const ctx = createTestContext();

	afterEach(() => {
		vi.clearAllMocks();
	});

	test("happy path", async () => {
		mockWorkersTypesDirectory();

		const entrypoint = getLatestTypesEntrypoint(ctx);
		expect(entrypoint).toBe("2023-07-01");
	});

	test("read error", async () => {
		mockWorkersTypesDirectory(() => {
			throw new Error("ENOENT: no such file or directory");
		});

		const entrypoint = getLatestTypesEntrypoint(ctx);
		expect(entrypoint).toBe(null);
	});

	test("empty directory", async () => {
		mockWorkersTypesDirectory(() => []);

		const entrypoint = getLatestTypesEntrypoint(ctx);
		expect(entrypoint).toBe(null);
	});

	test("no compat dates found", async () => {
		mockWorkersTypesDirectory(() => ["foo", "bar"]);

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
		mockWorkersTypesDirectory();

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

	test("tsconfig.json not found", async () => {
		vi.mocked(existsSync).mockImplementation(() => false);
		await addWorkersTypesToTsConfig(ctx);
		expect(writeFile).not.toHaveBeenCalled();
	});

	test("latest entrypoint not found", async () => {
		vi.mocked(readdirSync).mockImplementation(
			() => ["README.md"] as unknown as Dirent[]
		);
		await addWorkersTypesToTsConfig(ctx);

		expect(writeFile).not.toHaveBeenCalled();
	});

	test("don't clobber existing entrypoints", async () => {
		vi.mocked(readFile).mockImplementation(
			() => `{types: ["@cloudflare/workers-types/2021-03-20"]}`
		);
		await addWorkersTypesToTsConfig(ctx);

		expect(vi.mocked(writeFile).mock.calls[0][1]).toEqual(
			`{types: ["@cloudflare/workers-types/2021-03-20"]}`
		);
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
