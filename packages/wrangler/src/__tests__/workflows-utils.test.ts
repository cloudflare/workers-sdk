import { describe, it } from "vitest";
import { logger } from "../logger";
import { getJsonAwareRetryLogger } from "../workflows/utils";
import { mockConsoleMethods } from "./helpers/mock-console";

describe("getJsonAwareRetryLogger()", () => {
	const std = mockConsoleMethods();

	it.for([false, undefined])(
		"should return the shared logger when json is %s",
		(json, { expect }) => {
			expect(getJsonAwareRetryLogger(json)).toBe(logger);
		}
	);

	it("should keep info and log output on stdout when json is false", ({
		expect,
	}) => {
		const retryLogger = getJsonAwareRetryLogger(false);
		retryLogger.info("info notice");
		retryLogger.log("log notice");

		expect(std.info).toContain("info notice");
		expect(std.out).toContain("log notice");
		expect(std.warn).toBe("");
	});

	it("should redirect info and log output to stderr when json is true", ({
		expect,
	}) => {
		const retryLogger = getJsonAwareRetryLogger(true);
		retryLogger.info("info notice");
		retryLogger.log("log notice");

		expect(std.out).toBe("");
		expect(std.info).toBe("");
		expect(std.warn).toContain("info notice");
		expect(std.warn).toContain("log notice");
	});

	it("should keep warn and error on their usual streams when json is true", ({
		expect,
	}) => {
		const retryLogger = getJsonAwareRetryLogger(true);
		retryLogger.warn("warn notice");
		retryLogger.error("error notice");

		expect(std.out).toBe("");
		expect(std.warn).toContain("warn notice");
		expect(std.err).toContain("error notice");
	});
});
