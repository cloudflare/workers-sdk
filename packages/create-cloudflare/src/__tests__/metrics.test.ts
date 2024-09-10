import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { collectCLIOutput, normalizeOutput } from "../../../cli/test-util";
import {
	readMetricsConfig,
	writeMetricsConfig,
} from "../helpers/metrics-config";
import {
	runTelemetryCommand,
} from "../metrics";

vi.mock("helpers/metrics-config");

describe("runTelemetryCommand", () => {
	const std = collectCLIOutput();

	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	test("run telemetry status when c3permission is disabled", async () => {
		vi.mocked(readMetricsConfig).mockReturnValueOnce({
			c3permission: {
				enabled: false,
				date: new Date(),
			},
		});

		runTelemetryCommand("status");

		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"Status: Disabled

			"
		`);
	});

	test("run telemetry status when c3permission is enabled", async () => {
		vi.mocked(readMetricsConfig).mockReturnValueOnce({
			c3permission: {
				enabled: true,
				date: new Date(),
			},
		});

		runTelemetryCommand("status");

		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"Status: Enabled

			"
		`);
	});

	test("run telemetry enable when c3permission is disabled", async () => {
		vi.mocked(readMetricsConfig).mockReturnValueOnce({
			c3permission: {
				enabled: false,
				date: new Date(),
			},
		});

		runTelemetryCommand("enable");

		expect(writeMetricsConfig).toBeCalledWith({
			c3permission: {
				enabled: true,
				date: new Date(),
			},
		});
		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"Status: Enabled

			Create-Cloudflare is now collecting telemetry about your usage. Thank you for helping us improve the experience!
			"
		`);
	});

	test("run telemetry enable when c3permission is enabled", async () => {
		vi.mocked(readMetricsConfig).mockReturnValueOnce({
			c3permission: {
				enabled: true,
				date: new Date(),
			},
		});

		runTelemetryCommand("enable");

		expect(writeMetricsConfig).not.toBeCalled();
		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"Status: Enabled

			Create-Cloudflare is now collecting telemetry about your usage. Thank you for helping us improve the experience!
			"
		`);
	});

	test("run telemetry disable when c3permission is enabled", async () => {
		vi.mocked(readMetricsConfig).mockReturnValueOnce({
			c3permission: {
				enabled: true,
				date: new Date(),
			},
		});

		runTelemetryCommand("disable");

		expect(writeMetricsConfig).toBeCalledWith({
			c3permission: {
				enabled: false,
				date: new Date(),
			},
		});
		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"Status: Disabled

			Create-Cloudflare is no longer collecting telemetry
			"
		`);
	});

	test("run telemetry disable when c3permission is disabled", async () => {
		vi.mocked(readMetricsConfig).mockReturnValueOnce({
			c3permission: {
				enabled: false,
				date: new Date(),
			},
		});

		runTelemetryCommand("disable");

		expect(writeMetricsConfig).not.toBeCalled();
		expect(normalizeOutput(std.out)).toMatchInlineSnapshot(`
			"Status: Disabled

			Create-Cloudflare is no longer collecting telemetry
			"
		`);
	});
});
