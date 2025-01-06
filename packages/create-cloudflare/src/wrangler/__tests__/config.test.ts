import { existsSync } from "fs";
import { mockWorkersTypesDirectory } from "helpers/__tests__/mocks";
import { getWorkerdCompatibilityDate } from "helpers/compatDate";
import { readFile, writeFile } from "helpers/files";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createTestContext } from "../../__tests__/helpers";
import { updateWranglerConfig } from "../config";

vi.mock("helpers/files");
vi.mock("helpers/compatDate");
vi.mock("fs");

const mockCompatDate = "2024-01-17";

describe("update wrangler config", () => {
	const ctx = createTestContext();

	beforeEach(() => {
		vi.mocked(getWorkerdCompatibilityDate).mockReturnValue(
			Promise.resolve(mockCompatDate),
		);
		vi.mocked(existsSync).mockImplementation((f) =>
			(f as string).endsWith(".toml"),
		);
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

		await updateWranglerConfig(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatchInlineSnapshot(`
			"#:schema node_modules/wrangler/config-schema.json
			# For more details on how to configure Wrangler, refer to:
			# https://developers.cloudflare.com/workers/wrangler/configuration/
			name = "test"
			main = "src/index.ts"
			compatibility_date = "2024-01-17"
			"
		`);
	});

	test("placeholder replacement (json)", async () => {
		vi.mocked(existsSync).mockImplementationOnce((f) =>
			(f as string).endsWith(".json"),
		);
		const json = JSON.stringify({
			name: "<TBD>",
			main: "src/index.ts",
			compatibility_date: "<TBD>",
		});
		vi.mocked(readFile).mockReturnValueOnce(json);

		await updateWranglerConfig(ctx);

		const newConfig = vi.mocked(writeFile).mock.calls[0][1];
		expect(newConfig).toMatchInlineSnapshot(`
			"// For more details on how to configure Wrangler, refer to:
			// https://developers.cloudflare.com/workers/wrangler/configuration/
			{
			  "name": "test",
			  "main": "src/index.ts",
			  "compatibility_date": "2024-01-17",
			  "$schema": "node_modules/wrangler/config-schema.json"
			}"
		`);
	});

	test("string literal replacement", async () => {
		const toml = [`name = "my-cool-worker"`, `main = "src/index.ts"`].join(
			"\n",
		);
		vi.mocked(readFile).mockReturnValue(toml);

		await updateWranglerConfig(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatchInlineSnapshot(`
			"#:schema node_modules/wrangler/config-schema.json
			# For more details on how to configure Wrangler, refer to:
			# https://developers.cloudflare.com/workers/wrangler/configuration/
			name = "test"
			main = "src/index.ts"
			compatibility_date = "2024-01-17"
			"
		`);
	});

	test("missing name and compat date", async () => {
		const toml = `main = "src/index.ts"`;
		vi.mocked(readFile).mockReturnValue(toml);

		await updateWranglerConfig(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatchInlineSnapshot(`
			"#:schema node_modules/wrangler/config-schema.json
			# For more details on how to configure Wrangler, refer to:
			# https://developers.cloudflare.com/workers/wrangler/configuration/
			main = "src/index.ts"
			name = "test"
			compatibility_date = "2024-01-17"
			"
		`);
	});

	test("dont replace valid existing compatibility date", async () => {
		const toml = [
			`name = "super-old-worker"`,
			`compatibility_date = "2001-10-12"`,
		].join("\n");
		vi.mocked(readFile).mockReturnValue(toml);

		await updateWranglerConfig(ctx);

		const newToml = vi.mocked(writeFile).mock.calls[0][1];
		expect(newToml).toMatchInlineSnapshot(`
			"#:schema node_modules/wrangler/config-schema.json
			# For more details on how to configure Wrangler, refer to:
			# https://developers.cloudflare.com/workers/wrangler/configuration/
			name = "test"
			compatibility_date = "2001-10-12"
			"
		`);
	});
});
