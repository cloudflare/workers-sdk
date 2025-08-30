import fs from "node:fs/promises";
import path from "node:path";
import { inspect } from "node:util";
import { vi } from "vitest";
import { normalizeOutput } from "../../../e2e/helpers/normalize";
import { getBasePath, getWranglerTmpDir } from "../../paths";
import { generateOpencodeConfig } from "../../prompt/config-generator";
import type { Mock } from "vitest";

vi.mock("node:fs/promises");
vi.mock("../../config/config-helpers");
vi.mock("../../paths", () => ({
	getWranglerTmpDir: vi.fn(),
	getBasePath: vi.fn(),
}));

describe("generateOpencodeConfig()", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should generate config file", async () => {
		const mockTmpDir = { path: "/tmp/wrangler-opencode" };
		const projectPath = "/project";
		const expectedConfigPath = path.join(mockTmpDir.path, "opencode.json");

		vi.mocked(getWranglerTmpDir as Mock).mockReturnValue(mockTmpDir);
		vi.mocked(getBasePath as Mock).mockReturnValue("/wrangler/base/path");
		vi.mocked(fs.writeFile as Mock).mockResolvedValue(undefined);

		const result = await generateOpencodeConfig(projectPath);

		expect(result).toBe(expectedConfigPath);
		expect(getWranglerTmpDir).toHaveBeenCalledWith(projectPath, "opencode");
		expect(fs.writeFile).toHaveBeenCalledWith(
			expectedConfigPath,
			expect.stringContaining('"$schema": "https://opencode.ai/config.json"'),
			"utf8"
		);

		const writeFileCall = vi.mocked(fs.writeFile as Mock).mock.calls[0];
		const configContent = JSON.parse(writeFileCall[1]);
		expect(normalizeOutput(inspect(configContent))).toMatchInlineSnapshot(`
			"{
			  '$schema': 'https://opencode.ai/config.json',
			  plugin: [ '/wrangler/base/path/src/prompt/opencode-plugin.js' ]
			}"
		`);
	});

	it("should throw error when file write fails", async () => {
		const mockTmpDir = { path: "/tmp/wrangler-opencode" };
		const projectPath = "/project";

		vi.mocked(getWranglerTmpDir as Mock).mockReturnValue(mockTmpDir);
		vi.mocked(getBasePath as Mock).mockReturnValue("/wrangler/base/path");
		vi.mocked(fs.writeFile as Mock).mockRejectedValue(
			new Error("Permission denied")
		);

		await expect(generateOpencodeConfig(projectPath)).rejects.toThrow(
			"Permission denied"
		);
	});
});
