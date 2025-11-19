import { mockConsoleMethods as mockConsoleMethodsCommon } from "@cloudflare/workers-utils/test-helpers";
import { beforeEach } from "vitest";
import { logger } from "../../logger";

/**
 * Mock out the console methods and return an object to access their outputs.
 *
 * This augments the mockConsoleMethods from `@cloudflare/workers-utils` by also setting logger.columns to 100
 * before each test, ensuring consistent formatting in console outputs.
 */
export function mockConsoleMethods(): {
	debug: string;
	out: string;
	info: string;
	err: string;
	warn: string;
	getAndClearOut: () => "";
} {
	beforeEach(() => {
		logger.columns = 100;
	});
	return mockConsoleMethodsCommon();
}
