import { existsSync } from "node:fs";
import { mockSpinner } from "helpers/__tests__/mocks";
import { getLatestTypesEntrypoint } from "helpers/compatDate";
import { readFile, writeFile } from "helpers/files";
import { beforeEach, describe, test, vi } from "vitest";
import { updateTsConfig } from "../workers";
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

describe("updateTsConfig", () => {
	let ctx: C3Context;

	beforeEach(() => {
		ctx = createTestContext();
		ctx.args.ts = true;
		ctx.template.workersTypes = "generated";

		vi.mocked(existsSync).mockImplementation(() => true);
		vi.mocked(getLatestTypesEntrypoint).mockReturnValue(mockCompatDate);

		// Mock the read of tsconfig.json
		vi.mocked(readFile).mockImplementation(
			() => `{ "compilerOptions": { "types": ["@cloudflare/workers-types"]} }`,
		);
	});

	test("installing workers types", async ({ expect }) => {
		ctx.template.workersTypes = "installed";

		await updateTsConfig(ctx, { usesNodeCompat: false });

		expect(writeFile).toHaveBeenCalled();

		expect(vi.mocked(writeFile).mock.calls[0][1]).toContain(
			`"@cloudflare/workers-types/${mockCompatDate}"`,
		);
	});

	test("tsconfig.json not found", async ({ expect }) => {
		vi.mocked(existsSync).mockImplementation(() => false);
		await updateTsConfig(ctx, { usesNodeCompat: false });
		expect(writeFile).not.toHaveBeenCalled();
	});

	test("latest entrypoint not found", async ({ expect }) => {
		ctx.template.workersTypes = "installed";

		vi.mocked(getLatestTypesEntrypoint).mockReturnValue(null);
		await updateTsConfig(ctx, { usesNodeCompat: false });

		expect(writeFile).not.toHaveBeenCalled();
	});

	test("don't clobber existing entrypoints", async ({ expect }) => {
		ctx.template.workersTypes = "installed";
		vi.mocked(readFile).mockImplementation(
			() =>
				`{ "compilerOptions": { "types" : ["@cloudflare/workers-types/2021-03-20"]} }`,
		);
		await updateTsConfig(ctx, { usesNodeCompat: false });

		expect(vi.mocked(writeFile).mock.calls[0][1]).toContain(
			`"@cloudflare/workers-types/2021-03-20"`,
		);
	});

	test("will remove workers-types when generating types, if generated types include runtime types", async ({
		expect,
	}) => {
		vi.mocked(readFile).mockImplementation((path) => {
			if (path.includes("tsconfig.json")) {
				return `{ "compilerOptions": { "types" : ["@cloudflare/workers-types/2021-03-20"]} }`;
			} else {
				return "// Runtime types generated with workerd";
			}
		});
		await updateTsConfig(ctx, { usesNodeCompat: false });
		expect(vi.mocked(writeFile).mock.calls[0][1]).not.toContain(
			`"@cloudflare/workers-types/2021-03-20"`,
		);
	});

	test("will NOT remove workers-types when generating types, if generated types don't include runtime types", async ({
		expect,
	}) => {
		vi.mocked(readFile).mockImplementation((path) => {
			if (path.includes("tsconfig.json")) {
				return `{ "compilerOptions": { "types" : ["@cloudflare/workers-types/2021-03-20"]} }`;
			} else {
				return "no runtime types here";
			}
		});
		await updateTsConfig(ctx, { usesNodeCompat: false });

		expect(vi.mocked(writeFile).mock.calls[0][1]).toContain(
			`"@cloudflare/workers-types/2021-03-20"`,
		);
	});

	test("will add generated types file", async ({ expect }) => {
		await updateTsConfig(ctx, { usesNodeCompat: false });
		expect(vi.mocked(writeFile).mock.calls[0][1]).toContain(
			`./worker-configuration.d.ts`,
		);
	});

	test("skips modification when tsconfig uses project references", async ({
		expect,
	}) => {
		vi.mocked(readFile).mockImplementation(
			() => `{
				"files": [],
				"references": [
					{ "path": "./tsconfig.app.json" },
					{ "path": "./tsconfig.node.json" }
				]
			}`,
		);
		await updateTsConfig(ctx, { usesNodeCompat: false });
		expect(writeFile).not.toHaveBeenCalled();
	});

	test("modifies tsconfig when references array is empty", async ({
		expect,
	}) => {
		ctx.template.workersTypes = "installed";
		vi.mocked(readFile).mockImplementation(
			() => `{
				"compilerOptions": { "types": [] },
				"references": []
			}`,
		);
		await updateTsConfig(ctx, { usesNodeCompat: false });
		expect(writeFile).toHaveBeenCalled();
	});
});
