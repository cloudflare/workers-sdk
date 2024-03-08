import { existsSync } from "fs";
import { spinner } from "@cloudflare/cli/interactive";
import { mockWorkersTypesDirectory } from "helpers/__tests__/mocks";
import {
	getLatestTypesEntrypoint,
	getWorkerdCompatibilityDate,
} from "helpers/compatDate";
import { readFile, writeFile } from "helpers/files";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { addWorkersTypesToTsConfig, updateWranglerToml } from "../workers";
import { createTestContext } from "./helpers";
import type { C3Context } from "types";

vi.mock("helpers/files");
vi.mock("helpers/compatDate");
vi.mock("fs");
vi.mock("@cloudflare/cli/interactive");

beforeEach(() => {
	// we mock `spinner` to remove noisy logs from the test runs
	vi.mocked(spinner).mockImplementation(() => ({
		start() {},
		update() {},
		stop() {},
	}));
});

const mockCompatDate = "2024-01-17";

describe("addWorkersTypesToTsConfig", () => {
	let ctx: C3Context;

	beforeEach(() => {
		ctx = createTestContext();
		ctx.args.ts = true;

		vi.mocked(existsSync).mockImplementation(() => true);
		vi.mocked(getLatestTypesEntrypoint).mockReturnValue(mockCompatDate);

		// Mock the read of tsconfig.json
		vi.mocked(readFile).mockImplementation(
			() => `{ "compilerOptions": { "types": ["@cloudflare/workers-types"]} }`
		);
	});

	test("happy path", async () => {
		await addWorkersTypesToTsConfig(ctx);

		expect(writeFile).toHaveBeenCalled();

		expect(vi.mocked(writeFile).mock.calls[0][1]).toContain(
			`"@cloudflare/workers-types/${mockCompatDate}"`
		);
	});

	test("tsconfig.json not found", async () => {
		vi.mocked(existsSync).mockImplementation(() => false);
		await addWorkersTypesToTsConfig(ctx);
		expect(writeFile).not.toHaveBeenCalled();
	});

	test("latest entrypoint not found", async () => {
		vi.mocked(getLatestTypesEntrypoint).mockReturnValue(null);
		await addWorkersTypesToTsConfig(ctx);

		expect(writeFile).not.toHaveBeenCalled();
	});

	test("don't clobber existing entrypoints", async () => {
		vi.mocked(readFile).mockImplementation(
			() =>
				`{ "compilerOptions": { "types" : ["@cloudflare/workers-types/2021-03-20"]} }`
		);
		await addWorkersTypesToTsConfig(ctx);

		expect(vi.mocked(writeFile).mock.calls[0][1]).toContain(
			`"@cloudflare/workers-types/2021-03-20"`
		);
	});
});

describe("updateWranglerToml", () => {
	const ctx = createTestContext();

	beforeEach(() => {
		vi.mocked(getWorkerdCompatibilityDate).mockReturnValue(
			Promise.resolve(mockCompatDate)
		);
		vi.mocked(existsSync).mockImplementation(() => true);
		mockWorkersTypesDirectory();

		// Mock the read of tsconfig.json
		vi.mocked(readFile).mockImplementation(
			() => `{ "compilerOptions": { "types": ["@cloudflare/workers-types"]} }`
		);
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
