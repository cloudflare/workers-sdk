import { error, logRaw, setLogLevel } from "@cloudflare/cli";
import { Logger } from "../logger";
import { mockCLIOutput, mockConsoleMethods } from "./helpers/mock-console";

describe("logger", () => {
	const std = mockConsoleMethods();

	it("should add colored markers to error and warning messages", () => {
		const logger = new Logger();
		logger.loggerLevel = "debug";
		logger.debug("This is a debug message");
		logger.log("This is a log message");
		logger.warn("This is a warn message");
		logger.error("This is a error message");

		expect(std.debug).toMatchInlineSnapshot(`"This is a debug message"`);
		expect(std.out).toMatchInlineSnapshot(`"This is a log message"`);
		expect(std.warn).toMatchInlineSnapshot(`
      "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThis is a warn message[0m

      "
    `);
		expect(std.err).toMatchInlineSnapshot(`
      "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThis is a error message[0m

      "
    `);
	});

	describe("loggerLevel=debug", () => {
		it("should render messages that are at or above the log level set in the logger", () => {
			const logger = new Logger();
			logger.loggerLevel = "debug";
			logger.debug("This is a debug message");
			logger.log("This is a log message");
			logger.warn("This is a warn message");
			logger.error("This is a error message");

			expect(std.debug).toMatchInlineSnapshot(`"This is a debug message"`);
			expect(std.out).toMatchInlineSnapshot(`"This is a log message"`);
			expect(std.warn).toMatchInlineSnapshot(`
        "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThis is a warn message[0m

        "
      `);
			expect(std.err).toMatchInlineSnapshot(`
        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThis is a error message[0m

        "
      `);
		});
	});

	describe("loggerLevel=log", () => {
		it("should render messages that are at or above the log level set in the logger", () => {
			const logger = new Logger();
			logger.loggerLevel = "log";
			logger.debug("This is a debug message");
			logger.log("This is a log message");
			logger.warn("This is a warn message");
			logger.error("This is a error message");

			expect(std.debug).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`"This is a log message"`);
			expect(std.warn).toMatchInlineSnapshot(`
        "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThis is a warn message[0m

        "
      `);
			expect(std.err).toMatchInlineSnapshot(`
        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThis is a error message[0m

        "
      `);
		});
	});

	describe("loggerLevel=warn", () => {
		it("should render messages that are at or above the log level set in the logger", () => {
			const logger = new Logger();
			logger.loggerLevel = "warn";
			logger.debug("This is a debug message");
			logger.log("This is a log message");
			logger.warn("This is a warn message");
			logger.error("This is a error message");

			expect(std.debug).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
        "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThis is a warn message[0m

        "
      `);
			expect(std.err).toMatchInlineSnapshot(`
        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThis is a error message[0m

        "
      `);
		});
	});

	describe("loggerLevel=error", () => {
		it("should render messages that are at or above the log level set in the logger", () => {
			const logger = new Logger();
			logger.loggerLevel = "error";
			logger.debug("This is a debug message");
			logger.log("This is a log message");
			logger.warn("This is a warn message");
			logger.error("This is a error message");

			expect(std.debug).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`
        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThis is a error message[0m

        "
      `);
		});
	});

	describe("loggerLevelFromEnvVar=error", () => {
		beforeEach(() => {
			vi.stubEnv("WRANGLER_LOG", "error");
		});

		it("should render messages that are at or above the log level set in the env var", () => {
			const logger = new Logger();
			logger.debug("This is a debug message");
			logger.log("This is a log message");
			logger.warn("This is a warn message");
			logger.error("This is a error message");

			expect(std.debug).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`""`);
			expect(std.err).toMatchInlineSnapshot(`
        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThis is a error message[0m

        "
      `);
		});
	});

	describe("loggerLevelFromEnvVar case-insensitive", () => {
		beforeEach(() => {
			vi.stubEnv("WRANGLER_LOG", "wARn");
		});
		afterEach(() => {
			vi.stubEnv("WRANGLER_LOG", "");
		});

		it("should render messages that are at or above the log level set in the env var", () => {
			const logger = new Logger();
			logger.debug("This is a debug message");
			logger.log("This is a log message");
			logger.warn("This is a warn message");
			logger.error("This is a error message");

			expect(std.debug).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`""`);
			expect(std.warn).toMatchInlineSnapshot(`
        "[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThis is a warn message[0m

        "
      `);
			expect(std.err).toMatchInlineSnapshot(`
        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThis is a error message[0m

        "
      `);
		});
	});

	describe("loggerLevelFromEnvVar falls back to log on invalid level", () => {
		beforeEach(() => {
			vi.stubEnv("WRANGLER_LOG", "everything");
		});
		afterEach(() => {
			vi.stubEnv("WRANGLER_LOG", "");
		});

		it("should render messages that are at or above the log level set in the env var", () => {
			const logger = new Logger();
			logger.debug("This is a debug message");
			logger.log("This is a log message");
			logger.warn("This is a warn message");
			logger.error("This is a error message");

			expect(std.debug).toMatchInlineSnapshot(`""`);
			expect(std.out).toMatchInlineSnapshot(`"This is a log message"`);
			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mUnrecognised WRANGLER_LOG value \\"everything\\", expected \\"none\\" | \\"error\\" | \\"warn\\" | \\"info\\" | \\"log\\" | \\"debug\\", defaulting to \\"log\\"...[0m


				[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThis is a warn message[0m

				"
			`);
			expect(std.err).toMatchInlineSnapshot(`
        "[31mX [41;31m[[41;97mERROR[41;31m][0m [1mThis is a error message[0m

        "
      `);
		});
	});

	describe("once", () => {
		it("should only log the same message once", () => {
			const logger = new Logger();
			logger.once.warn("This is a once.warn message");
			logger.once.warn("This is a once.warn message");
			logger.once.warn("This is a once.warn message");
			logger.once.warn("This is a once.warn message");
			logger.once.warn("This is a once.warn message");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThis is a once.warn message[0m

				"
			`);
		});

		it("should log once per log level", () => {
			const logger = new Logger();
			logger.once.warn("This is a once message");
			logger.once.info("This is a once message");
			logger.once.warn("This is a once message");
			logger.once.warn("This is a once message");
			logger.once.info("This is a once message");
			logger.once.info("This is a once message");
			logger.once.warn("This is a once message");

			expect(std.warn).toMatchInlineSnapshot(`
				"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mThis is a once message[0m

				"
			`);
			expect(std.info).toMatchInlineSnapshot(`"This is a once message"`);
		});
	});

	describe("@cloudflare/cli logRaw", () => {
		const cliOut = mockCLIOutput();

		it("should output at log level", () => {
			setLogLevel("log");
			logRaw("This is a logRaw message");
			expect(cliOut.stdout).toMatchInlineSnapshot(
				`"This is a logRaw message\n"`
			);
		});

		it("should not output when log level is set to warn", () => {
			setLogLevel("warn");
			logRaw("This is a logRaw message");
			expect(cliOut.stdout).toMatchInlineSnapshot(`""`);
		});

		it("should not output when log level is set to error", () => {
			setLogLevel("error");
			logRaw("This is a logRaw message");
			expect(cliOut.stdout).toMatchInlineSnapshot(`""`);
		});

		it("should not output when log level is set to none", () => {
			setLogLevel("none");
			logRaw("This is a logRaw message");
			expect(cliOut.stdout).toMatchInlineSnapshot(`""`);
		});

		it("should output when log level is set to debug", () => {
			setLogLevel("debug");
			logRaw("This is a logRaw message");
			expect(cliOut.stdout).toMatchInlineSnapshot(
				`"This is a logRaw message\n"`
			);
		});
	});

	describe("@cloudflare/cli error", () => {
		const cliOut = mockCLIOutput();

		it("should output at error level", () => {
			setLogLevel("error");
			error("This is an error message");
			expect(cliOut.stderr).toMatchInlineSnapshot(
				`"╰  ERROR  This is an error message\n"`
			);
		});

		it("should not output when log level is set to none", () => {
			setLogLevel("none");
			error("This is an error message");
			expect(cliOut.stderr).toMatchInlineSnapshot(`""`);
		});

		it("should output when log level is set to warn", () => {
			setLogLevel("warn");
			error("This is an error message");
			expect(cliOut.stderr).toMatchInlineSnapshot(
				`"╰  ERROR  This is an error message\n"`
			);
		});

		it("should output when log level is set to log", () => {
			setLogLevel("log");
			error("This is an error message");
			expect(cliOut.stderr).toMatchInlineSnapshot(
				`"╰  ERROR  This is an error message\n"`
			);
		});

		it("should output when log level is set to debug", () => {
			setLogLevel("debug");
			error("This is an error message");
			expect(cliOut.stderr).toMatchInlineSnapshot(
				`"╰  ERROR  This is an error message\n"`
			);
		});
	});
});
