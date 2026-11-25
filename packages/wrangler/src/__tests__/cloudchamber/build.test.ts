import { mkdirSync, writeFileSync } from "node:fs";
import { buildCommand } from "@cloudflare/containers-shared";
import { runInTempDir } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach, describe, it, vi } from "vitest";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runWrangler } from "../helpers/run-wrangler";
import { mockAccountV4 as mockAccount } from "./utils";

vi.mock("@cloudflare/containers-shared", async (importOriginal) => {
	const actual = await importOriginal();
	return Object.assign({}, actual, {
		buildCommand: vi.fn(),
	});
});

const dockerfile =
	'FROM node:22\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["node", "index.js"]';

describe("containers build", () => {
	runInTempDir();
	mockApiToken();
	mockAccountId();
	mockConsoleMethods();

	beforeEach(() => {
		vi.clearAllMocks();
		mkdirSync("./container-context");
		writeFileSync("./container-context/Dockerfile", dockerfile);
		mockAccount();
		vi.mocked(buildCommand).mockResolvedValue(undefined);
	});

	it("calls the shared build command with parsed args", async ({ expect }) => {
		await runWrangler(
			"containers build ./container-context -t test-app:tag -p"
		);

		expect(buildCommand).toHaveBeenCalledOnce();
		expect(buildCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				PATH: "./container-context",
				tag: "test-app:tag",
				push: true,
				platform: "linux/amd64",
			}),
			expect.any(Object)
		);
		expect(vi.mocked(buildCommand).mock.calls[0]?.[0]).not.toHaveProperty(
			"pathToDocker"
		);
	});

	it("passes --jurisdiction through to the shared command", async ({
		expect,
	}) => {
		await runWrangler(
			"containers build ./container-context -t test-app:tag -p --jurisdiction eu"
		);

		expect(vi.mocked(buildCommand).mock.calls[0]?.[1]).toEqual({
			compliance_region: undefined,
			jurisdiction: "eu",
		});
	});

	it("rejects --jurisdiction without --push", async ({ expect }) => {
		await expect(
			runWrangler(
				"containers build ./container-context -t test-app:tag --jurisdiction eu"
			)
		).rejects.toThrowErrorMatchingInlineSnapshot(
			`[Error: The --jurisdiction option only applies with --push.]`
		);
		expect(buildCommand).not.toHaveBeenCalled();
	});

	it("passes a custom Docker path through to the shared command", async ({
		expect,
	}) => {
		await runWrangler(
			"containers build ./container-context -t test-app:tag --path-to-docker /custom/docker"
		);

		expect(buildCommand).toHaveBeenCalledWith(
			expect.objectContaining({
				PATH: "./container-context",
				tag: "test-app:tag",
				pathToDocker: "/custom/docker",
				push: false,
			}),
			expect.any(Object)
		);
	});
});
