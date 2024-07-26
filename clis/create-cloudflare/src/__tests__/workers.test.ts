import { existsSync } from "fs";
import { mockSpinner } from "helpers/__tests__/mocks";
import { getLatestTypesEntrypoint } from "helpers/compatDate";
import { readFile, writeFile } from "helpers/files";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { addWorkersTypesToTsConfig } from "../workers";
import { createTestContext } from "./helpers";
import type { C3Context } from "types";

vi.mock("helpers/files");
vi.mock("helpers/compatDate");
vi.mock("fs");
vi.mock("@cloudflare/cli/interactive");

beforeEach(() => {
	mockSpinner();
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
			() => `{ "compilerOptions": { "types": ["@cloudflare/workers-types"]} }`,
		);
	});

	test("happy path", async () => {
		await addWorkersTypesToTsConfig(ctx);

		expect(writeFile).toHaveBeenCalled();

		expect(vi.mocked(writeFile).mock.calls[0][1]).toContain(
			`"@cloudflare/workers-types/${mockCompatDate}"`,
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
				`{ "compilerOptions": { "types" : ["@cloudflare/workers-types/2021-03-20"]} }`,
		);
		await addWorkersTypesToTsConfig(ctx);

		expect(vi.mocked(writeFile).mock.calls[0][1]).toContain(
			`"@cloudflare/workers-types/2021-03-20"`,
		);
	});
});
