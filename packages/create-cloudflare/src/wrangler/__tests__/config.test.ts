import { existsSync } from "fs";
import { mockWorkersTypesDirectory } from "helpers/__tests__/mocks";
import { getWorkerdCompatibilityDate } from "helpers/compatDate";
import { readFile, writeFile } from "helpers/files";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTestContext } from "../../__tests__/helpers";
import { updateWranglerToml } from "../config";
import TOML from "@iarna/toml";

vi.mock("helpers/files");
vi.mock("helpers/compatDate");
vi.mock("fs");

const mockCompatDate = "2024-01-17";

describe("updateWranglerToml", () => {
	const ctx = createTestContext();

	beforeEach(() => {
		vi.mocked(getWorkerdCompatibilityDate).mockReturnValue(
			Promise.resolve(mockCompatDate),
		);
		vi.mocked(existsSync).mockImplementation(() => true);
		mockWorkersTypesDirectory();

		// Mock the read of tsconfig.json
		vi.mocked(readFile).mockImplementation(
			() => `{ "compilerOptions": { "types": ["@cloudflare/workers-types"]} }`,
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
			"\n",
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
		// Validate the resulting toml by parsing it.
		TOML.parse(newToml);
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
