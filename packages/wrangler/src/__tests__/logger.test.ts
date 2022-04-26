import { logger } from "../logger";
import { mockConsoleMethods } from "./helpers/mock-console";

describe("logger", () => {
  const std = mockConsoleMethods();

  it("should add colored markers to error and warning messages", () => {
    logger.loggerLevel = "debug";
    logger.debug("This is a debug message");
    logger.log("This is a log message");
    logger.warn("This is a warn message");
    logger.error("This is a error message");

    expect(std.debug).toMatchInlineSnapshot(`"This is a debug message"`);
    expect(std.out).toMatchInlineSnapshot(`"This is a log message"`);
    expect(std.warn).toMatchInlineSnapshot(`"[33m⚠  [39mThis is a warn message"`);
    expect(std.err).toMatchInlineSnapshot(`"[31m✖  [39mThis is a error message"`);
  });

  describe("loggerLevel=debug", () => {
    it("should render messages that are at or above the log level set in the logger", () => {
      logger.loggerLevel = "debug";
      logger.debug("This is a debug message");
      logger.log("This is a log message");
      logger.warn("This is a warn message");
      logger.error("This is a error message");

      expect(std.debug).toMatchInlineSnapshot(`"This is a debug message"`);
      expect(std.out).toMatchInlineSnapshot(`"This is a log message"`);
      expect(std.warn).toMatchInlineSnapshot(`"[33m⚠  [39mThis is a warn message"`);
      expect(std.err).toMatchInlineSnapshot(`"[31m✖  [39mThis is a error message"`);
    });
  });

  describe("loggerLevel=log", () => {
    it("should render messages that are at or above the log level set in the logger", () => {
      logger.loggerLevel = "log";
      logger.debug("This is a debug message");
      logger.log("This is a log message");
      logger.warn("This is a warn message");
      logger.error("This is a error message");

      expect(std.debug).toMatchInlineSnapshot(`""`);
      expect(std.out).toMatchInlineSnapshot(`"This is a log message"`);
      expect(std.warn).toMatchInlineSnapshot(`"[33m⚠  [39mThis is a warn message"`);
      expect(std.err).toMatchInlineSnapshot(`"[31m✖  [39mThis is a error message"`);
    });
  });

  describe("loggerLevel=warn", () => {
    it("should render messages that are at or above the log level set in the logger", () => {
      logger.loggerLevel = "warn";
      logger.debug("This is a debug message");
      logger.log("This is a log message");
      logger.warn("This is a warn message");
      logger.error("This is a error message");

      expect(std.debug).toMatchInlineSnapshot(`""`);
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`"[33m⚠  [39mThis is a warn message"`);
      expect(std.err).toMatchInlineSnapshot(`"[31m✖  [39mThis is a error message"`);
    });
  });

  describe("loggerLevel=error", () => {
    it("should render messages that are at or above the log level set in the logger", () => {
      logger.loggerLevel = "error";
      logger.debug("This is a debug message");
      logger.log("This is a log message");
      logger.warn("This is a warn message");
      logger.error("This is a error message");

      expect(std.debug).toMatchInlineSnapshot(`""`);
      expect(std.out).toMatchInlineSnapshot(`""`);
      expect(std.warn).toMatchInlineSnapshot(`""`);
      expect(std.err).toMatchInlineSnapshot(`"[31m✖  [39mThis is a error message"`);
    });
  });
});
