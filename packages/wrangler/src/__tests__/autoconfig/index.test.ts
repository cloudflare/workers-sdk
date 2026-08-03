import {
	AutoConfigDetectionError,
	getDetailsForAutoConfig,
	runAutoConfig,
} from "@cloudflare/autoconfig";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import {
	runAutoConfigDetection,
	runAutoConfigLogic,
	sendAutoConfigProcessStartedMetricsEvent,
} from "../../autoconfig";
import { sendMetricsEvent } from "../../metrics/send-event";
import type * as SendEventModule from "../../metrics/send-event";
import type {
	AutoConfigContext,
	AutoConfigDetails,
	AutoConfigSummary,
} from "@cloudflare/autoconfig";
import type { Config } from "@cloudflare/workers-utils";

vi.mock("@cloudflare/autoconfig", async (importOriginal) => ({
	...(await importOriginal()),
	getDetailsForAutoConfig: vi.fn(),
	runAutoConfig: vi.fn(),
}));

vi.mock("../../metrics/send-event", async (importOriginal) => {
	const original = await importOriginal<typeof SendEventModule>();
	return {
		...original,
		sendMetricsEvent: vi.fn(),
	};
});

/** Minimal mock satisfying {@link AutoConfigContext} for pass-through testing. */
const mockContext = {} as AutoConfigContext;

/** Minimal mock satisfying {@link Config} for pass-through testing. */
const mockConfig = {} as Config;

/** Minimal mock satisfying {@link AutoConfigDetails} with a detected framework. */
const mockDetails = {
	configured: false,
	framework: { id: "static" },
} as unknown as AutoConfigDetails;

/** Minimal mock satisfying {@link AutoConfigSummary}. */
const mockSummary = {
	scripts: {},
	wranglerInstall: false,
	outputDir: "dist",
} as unknown as AutoConfigSummary;

describe("autoconfig wrappers", () => {
	beforeEach(() => {
		// Initialize the module-level autoConfigId state that both wrappers rely on.
		// This mirrors what callers do before invoking detection/configuration.
		sendAutoConfigProcessStartedMetricsEvent({
			command: "wrangler deploy",
			dryRun: false,
		});

		// Clear the sendMetricsEvent mock so the process_started call above
		// doesn't pollute per-test assertions.
		vi.mocked(sendMetricsEvent).mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("runAutoConfigDetection", () => {
		it("calls getDetailsForAutoConfig with the provided config and context, and returns the result", async ({
			expect,
		}) => {
			vi.mocked(getDetailsForAutoConfig).mockResolvedValue(mockDetails);

			const result = await runAutoConfigDetection({
				command: "wrangler deploy",
				wranglerConfig: mockConfig,
				context: mockContext,
			});

			expect(getDetailsForAutoConfig).toHaveBeenCalledOnce();
			expect(getDetailsForAutoConfig).toHaveBeenCalledWith({
				wranglerConfig: mockConfig,
				context: mockContext,
			});
			expect(result).toBe(mockDetails);
		});

		it("sends detection_started then detection_completed on success", async ({
			expect,
		}) => {
			vi.mocked(getDetailsForAutoConfig).mockResolvedValue(mockDetails);

			await runAutoConfigDetection({
				command: "wrangler deploy",
				wranglerConfig: mockConfig,
				context: mockContext,
			});

			expect(sendMetricsEvent).toHaveBeenCalledTimes(2);

			expect(sendMetricsEvent).toHaveBeenNthCalledWith(
				1,
				"autoconfig_detection_started",
				expect.objectContaining({
					autoConfigId: expect.any(String),
					command: "wrangler deploy",
				}),
				{}
			);

			expect(sendMetricsEvent).toHaveBeenNthCalledWith(
				2,
				"autoconfig_detection_completed",
				expect.objectContaining({
					autoConfigId: expect.any(String),
					framework: "static",
					configured: false,
					success: true,
				}),
				{}
			);
		});

		it("sends detection_completed with error info on failure and re-throws the original error", async ({
			expect,
		}) => {
			const error = new Error("detection boom");
			vi.mocked(getDetailsForAutoConfig).mockRejectedValue(error);

			await expect(
				runAutoConfigDetection({
					command: "wrangler setup",
					wranglerConfig: mockConfig,
					context: mockContext,
				})
			).rejects.toBe(error);

			expect(getDetailsForAutoConfig).toHaveBeenCalledOnce();
			expect(sendMetricsEvent).toHaveBeenCalledTimes(2);

			expect(sendMetricsEvent).toHaveBeenNthCalledWith(
				2,
				"autoconfig_detection_completed",
				expect.objectContaining({
					autoConfigId: expect.any(String),
					framework: undefined,
					configured: false,
					success: false,
				}),
				{}
			);
		});

		it("extracts frameworkId and configured from AutoConfigDetectionError", async ({
			expect,
		}) => {
			const detectionError = new AutoConfigDetectionError("detection failed", {
				telemetryMessage: "detection failed",
				configured: true,
				frameworkId: "astro",
			});
			vi.mocked(getDetailsForAutoConfig).mockRejectedValue(detectionError);

			await expect(
				runAutoConfigDetection({
					command: "wrangler deploy",
					wranglerConfig: mockConfig,
					context: mockContext,
				})
			).rejects.toBe(detectionError);

			expect(sendMetricsEvent).toHaveBeenNthCalledWith(
				2,
				"autoconfig_detection_completed",
				expect.objectContaining({
					framework: "astro",
					configured: true,
					success: false,
				}),
				{}
			);
		});
	});

	describe("runAutoConfigLogic", () => {
		it("calls runAutoConfig with the provided details and options, and returns the result", async ({
			expect,
		}) => {
			vi.mocked(runAutoConfig).mockResolvedValue(mockSummary);

			const options = { context: mockContext, dryRun: false };
			const result = await runAutoConfigLogic(mockDetails, options);

			expect(runAutoConfig).toHaveBeenCalledOnce();
			expect(runAutoConfig).toHaveBeenCalledWith(mockDetails, options);
			expect(result).toBe(mockSummary);
		});

		it("sends configuration_started then configuration_completed on success", async ({
			expect,
		}) => {
			vi.mocked(runAutoConfig).mockResolvedValue(mockSummary);

			await runAutoConfigLogic(mockDetails, {
				context: mockContext,
				dryRun: true,
			});

			expect(sendMetricsEvent).toHaveBeenCalledTimes(2);

			expect(sendMetricsEvent).toHaveBeenNthCalledWith(
				1,
				"autoconfig_configuration_started",
				expect.objectContaining({
					autoConfigId: expect.any(String),
					framework: "static",
					dryRun: true,
				}),
				{}
			);

			expect(sendMetricsEvent).toHaveBeenNthCalledWith(
				2,
				"autoconfig_configuration_completed",
				expect.objectContaining({
					autoConfigId: expect.any(String),
					framework: "static",
					dryRun: true,
					success: true,
				}),
				{}
			);
		});

		it("sends configuration_completed with error info on failure and re-throws the original error", async ({
			expect,
		}) => {
			const error = new Error("configuration boom");
			vi.mocked(runAutoConfig).mockRejectedValue(error);

			await expect(
				runAutoConfigLogic(mockDetails, {
					context: mockContext,
					dryRun: false,
				})
			).rejects.toBe(error);

			expect(runAutoConfig).toHaveBeenCalledOnce();
			expect(sendMetricsEvent).toHaveBeenCalledTimes(2);

			expect(sendMetricsEvent).toHaveBeenNthCalledWith(
				2,
				"autoconfig_configuration_completed",
				expect.objectContaining({
					autoConfigId: expect.any(String),
					framework: "static",
					dryRun: false,
					success: false,
				}),
				{}
			);
		});
	});
});
