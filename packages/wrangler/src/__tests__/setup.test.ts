import { beforeEach, describe, expect, test, vi } from "vitest";
import * as autoConfigDetails from "../autoconfig/details";
import * as autoConfigRun from "../autoconfig/run";
import { mockConsoleMethods } from "./helpers/mock-console";
import { runInTempDir } from "./helpers/run-in-tmp";
import { runWrangler } from "./helpers/run-wrangler";
import type { AutoConfigDetails } from "../autoconfig/types";

describe("wrangler setup", () => {
	const std = mockConsoleMethods();
	runInTempDir();

	let getDetailsForAutoConfigSpy: ReturnType<typeof vi.spyOn>;
	let runAutoConfigSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		getDetailsForAutoConfigSpy = vi.spyOn(
			autoConfigDetails,
			"getDetailsForAutoConfig"
		);
		runAutoConfigSpy = vi.spyOn(autoConfigRun, "runAutoConfig");
	});

	test("--help", async () => {
		await runWrangler("setup --help");
		expect(std.out).toMatchInlineSnapshot(`
			"wrangler setup

			🆙 Setup a project to work on Cloudflare

			GLOBAL FLAGS
			  -c, --config    Path to Wrangler configuration file  [string]
			      --cwd       Run as if Wrangler was started in the specified directory instead of the current working directory  [string]
			  -e, --env       Environment to use for operations, and for selecting .env and .dev.vars files  [string]
			      --env-file  Path to an .env file to load - can be specified multiple times - values from earlier files are overridden by values in later files  [array]
			  -h, --help      Show help  [boolean]
			  -v, --version   Show version number  [boolean]"
		`);
	});

	test("should run autoconfig when project is not configured", async () => {
		const mockDetails: AutoConfigDetails = {
			configured: false,
			target: "worker",
			framework: null,
			entry: null,
			config: {} as any,
		};

		getDetailsForAutoConfigSpy.mockResolvedValue(mockDetails);
		runAutoConfigSpy.mockResolvedValue(undefined);

		await runWrangler("setup");

		expect(getDetailsForAutoConfigSpy).toHaveBeenCalledWith({
			wranglerConfig: expect.any(Object),
		});
		expect(runAutoConfigSpy).toHaveBeenCalledWith(mockDetails);
		expect(std.out).toContain("wrangler deploy");
	});

	test("should skip autoconfig when project is already configured", async () => {
		const mockDetails: AutoConfigDetails = {
			configured: true,
			target: "worker",
			framework: null,
			entry: null,
			config: {} as any,
		};

		getDetailsForAutoConfigSpy.mockResolvedValue(mockDetails);
		runAutoConfigSpy.mockResolvedValue(undefined);

		await runWrangler("setup");

		expect(getDetailsForAutoConfigSpy).toHaveBeenCalledWith({
			wranglerConfig: expect.any(Object),
		});
		expect(runAutoConfigSpy).not.toHaveBeenCalled();
		expect(std.out).toContain(
			"🎉 Your project is already setup to deploy to Cloudflare"
		);
		expect(std.out).toContain("wrangler deploy");
	});

	test("should always show deploy message", async () => {
		const mockDetails: AutoConfigDetails = {
			configured: true,
			target: "worker",
			framework: null,
			entry: null,
			config: {} as any,
		};

		getDetailsForAutoConfigSpy.mockResolvedValue(mockDetails);

		await runWrangler("setup");

		expect(std.out).toContain("You can now deploy with");
		expect(std.out).toContain("wrangler deploy");
	});

	test("should handle unconfigured Pages project", async () => {
		const mockDetails: AutoConfigDetails = {
			configured: false,
			target: "pages",
			framework: { name: "next", config: { path: "." } } as any,
			entry: null,
			config: {} as any,
		};

		getDetailsForAutoConfigSpy.mockResolvedValue(mockDetails);
		runAutoConfigSpy.mockResolvedValue(undefined);

		await runWrangler("setup");

		expect(getDetailsForAutoConfigSpy).toHaveBeenCalled();
		expect(runAutoConfigSpy).toHaveBeenCalledWith(mockDetails);
		expect(std.out).toContain("wrangler deploy");
	});

	test("should handle configured Pages project", async () => {
		const mockDetails: AutoConfigDetails = {
			configured: true,
			target: "pages",
			framework: { name: "next", config: { path: "." } } as any,
			entry: null,
			config: {} as any,
		};

		getDetailsForAutoConfigSpy.mockResolvedValue(mockDetails);

		await runWrangler("setup");

		expect(getDetailsForAutoConfigSpy).toHaveBeenCalled();
		expect(runAutoConfigSpy).not.toHaveBeenCalled();
		expect(std.out).toContain(
			"🎉 Your project is already setup to deploy to Cloudflare"
		);
	});

	test("should handle errors from getDetailsForAutoConfig", async () => {
		const error = new Error("Failed to get details");
		getDetailsForAutoConfigSpy.mockRejectedValue(error);

		await expect(runWrangler("setup")).rejects.toThrow("Failed to get details");
		expect(runAutoConfigSpy).not.toHaveBeenCalled();
	});

	test("should handle errors from runAutoConfig", async () => {
		const mockDetails: AutoConfigDetails = {
			configured: false,
			target: "worker",
			framework: null,
			entry: null,
			config: {} as any,
		};

		const error = new Error("Failed to run autoconfig");
		getDetailsForAutoConfigSpy.mockResolvedValue(mockDetails);
		runAutoConfigSpy.mockRejectedValue(error);

		await expect(runWrangler("setup")).rejects.toThrow(
			"Failed to run autoconfig"
		);
	});
});
