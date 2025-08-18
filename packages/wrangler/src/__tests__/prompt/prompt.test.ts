import { execa } from "execa";
import { vi } from "vitest";
import { generateOpencodeConfig } from "../../prompt/config-generator";
import {
	detectOpencode,
	installOpencode,
	isOpencodeVersionCompatible,
	upgradeOpencode,
} from "../../prompt/opencode-manager";
import { mockAccountId, mockApiToken } from "../helpers/mock-account-id";
import { mockConsoleMethods } from "../helpers/mock-console";
import { runInTempDir } from "../helpers/run-in-tmp";
import { runWrangler } from "../helpers/run-wrangler";
import type { Mock } from "vitest";

vi.mock("../../prompt/opencode-manager");
vi.mock("../../prompt/config-generator");

describe("wrangler prompt", () => {
	mockAccountId();
	mockApiToken();
	runInTempDir();

	const std = mockConsoleMethods();

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should show help", async () => {
		const result = runWrangler("prompt --help");

		await expect(result).resolves.toBeUndefined();
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler prompt [prompt]

			🤖 Launch AI assistant (opencode) [experimental]

			POSITIONALS
			  prompt  Optional starting prompt  [string]

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]

			OPTIONS
			      --auth  Authenticate with opencode (default: login)  [string] [choices: \\"login\\", \\"logout\\", \\"list\\"]"
		`);
	});

	it("should install opencode when not found", async () => {
		vi.mocked(detectOpencode as Mock).mockResolvedValue(null);
		vi.mocked(installOpencode as Mock).mockResolvedValue(undefined);
		vi.mocked(generateOpencodeConfig as Mock).mockResolvedValue(
			"/tmp/config.json"
		);
		vi.mocked(execa as Mock).mockResolvedValue(undefined);

		await runWrangler("prompt");

		expect(detectOpencode).toHaveBeenCalled();
		expect(installOpencode).toHaveBeenCalled();
		expect(std.out).toContain("opencode not found. Installing...");
	});

	it("should upgrade opencode when version is incompatible", async () => {
		vi.mocked(detectOpencode as Mock).mockResolvedValue("v0.1.0");
		vi.mocked(isOpencodeVersionCompatible as Mock).mockReturnValue(false);
		vi.mocked(upgradeOpencode as Mock).mockResolvedValue(undefined);
		vi.mocked(generateOpencodeConfig as Mock).mockResolvedValue(
			"/tmp/config.json"
		);
		vi.mocked(execa as Mock).mockResolvedValue(undefined);

		await runWrangler("prompt");

		expect(detectOpencode).toHaveBeenCalled();
		expect(isOpencodeVersionCompatible).toHaveBeenCalledWith("v0.1.0");
		expect(upgradeOpencode).toHaveBeenCalled();
		expect(std.out).toContain("opencode is not compatible. Upgrading...");
	});

	it("should run opencode directly when version is compatible", async () => {
		vi.mocked(detectOpencode as Mock).mockResolvedValue("v1.0.0");
		vi.mocked(isOpencodeVersionCompatible as Mock).mockReturnValue(true);
		vi.mocked(generateOpencodeConfig as Mock).mockResolvedValue(
			"/tmp/config.json"
		);
		vi.mocked(execa as Mock).mockResolvedValue(undefined);

		await runWrangler("prompt");

		expect(detectOpencode).toHaveBeenCalled();
		expect(isOpencodeVersionCompatible).toHaveBeenCalledWith("v1.0.0");
		expect(upgradeOpencode).not.toHaveBeenCalled();
		expect(installOpencode).not.toHaveBeenCalled();
		expect(execa).toHaveBeenCalledWith("opencode", ["--agent", "cloudflare"], {
			stdio: "inherit",
			env: expect.objectContaining({
				OPENCODE_CONFIG: "/tmp/config.json",
			}),
		});
	});

	it("should handle auth commands", async () => {
		vi.mocked(detectOpencode as Mock).mockResolvedValue("v1.0.0");
		vi.mocked(isOpencodeVersionCompatible as Mock).mockReturnValue(true);
		vi.mocked(execa as Mock).mockResolvedValue(undefined);

		await runWrangler("prompt --auth login");

		expect(execa).toHaveBeenCalledWith("opencode", ["auth", "login"], {
			stdio: "inherit",
		});
		expect(generateOpencodeConfig).not.toHaveBeenCalled();
	});

	it("should pass prompt argument when provided", async () => {
		vi.mocked(detectOpencode as Mock).mockResolvedValue("v1.0.0");
		vi.mocked(isOpencodeVersionCompatible as Mock).mockReturnValue(true);
		vi.mocked(generateOpencodeConfig as Mock).mockResolvedValue(
			"/tmp/config.json"
		);
		vi.mocked(execa as Mock).mockResolvedValue(undefined);

		await runWrangler("prompt --prompt 'hello world'");

		expect(execa).toHaveBeenCalledWith(
			"opencode",
			["--agent", "cloudflare", "--prompt", "hello world"],
			{
				stdio: "inherit",
				env: expect.objectContaining({
					OPENCODE_CONFIG: "/tmp/config.json",
				}),
			}
		);
	});

	it("should handle positional prompt argument", async () => {
		vi.mocked(detectOpencode as Mock).mockResolvedValue("v1.0.0");
		vi.mocked(isOpencodeVersionCompatible as Mock).mockReturnValue(true);
		vi.mocked(generateOpencodeConfig as Mock).mockResolvedValue(
			"/tmp/config.json"
		);
		vi.mocked(execa as Mock).mockResolvedValue(undefined);

		await runWrangler("prompt 'test prompt'");

		expect(execa).toHaveBeenCalledWith(
			"opencode",
			["--agent", "cloudflare", "--prompt", "test prompt"],
			{
				stdio: "inherit",
				env: expect.objectContaining({
					OPENCODE_CONFIG: "/tmp/config.json",
				}),
			}
		);
	});
});
