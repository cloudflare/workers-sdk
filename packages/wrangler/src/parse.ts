import { readFile as readFile_ } from "node:fs/promises";
import TOML from "@iarna/toml";
import { formatMessagesSync } from "esbuild";
import type { PartialMessage, Location } from "esbuild";

/**
 * Formats a message using esbuild's pretty-print algorithm.
 */
export function formatMessage(
  message: PartialMessage,
  kind: "warning" | "error" = "error",
  label?: string
): string {
  const lines = formatMessagesSync([message], {
    color: true,
    kind: kind,
    terminalWidth: process.stderr.columns,
  });
  if (label) {
    lines[0] = lines[0].replace(
      kind.toUpperCase(),
      `${label.toUpperCase()} ${kind.toUpperCase()}`
    );
  }
  return lines.join("\n");
}

/**
 * Formats and prints a message to stderr.
 */
export function printMessage(
  message: PartialMessage,
  kind?: "warning" | "error",
  label?: string
): void {
  const text = formatMessage(message, kind, label);
  process.stderr.write(text);
}

/**
 * An error that's thrown when something fails to parse.
 */
export class ParseError extends Error {
  readonly detail: PartialMessage;

  constructor(message: PartialMessage) {
    super(message.text);
    this.name = this.constructor.name;
    this.detail = message;
    if (!this.detail.notes) {
      this.detail.notes = [];
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A wrapper around `TOML.parse` that throws a friendly error.
 */
export function parseTOML(input: string, file?: string): any {
  try {
    return TOML.parse(input);
  } catch (err) {
    const { name, message, line, col } = err;
    if (name !== "TomlError") {
      throw err;
    }
    // Errors from the TOML parser are formatted as "... at row 1, col 3".
    // Since the formatter already formats the line and column, the message can be truncated.
    const text = message.split(" at row ", 2)[0];
    const lineText = input.split("\n")[line];
    const location = { file, lineText, line: line + 1, column: col - 2 };
    throw new ParseError({ text, location });
  }
}

/**
 * A wrapper around `JSON.parse` that throws a friendly error.
 */
export function parseJSON(input: string, file?: string): any {
  try {
    return JSON.parse(input);
  } catch (err) {
    const { message } = err;
    const index = message.lastIndexOf(" in JSON at position "); // length = 21
    if (index < 0) {
      throw err;
    }
    const text = message.substring(0, index);
    const position = parseInt(message.substring(index + 21));
    const location = indexLocation(input, position, { file });
    throw new ParseError({ text, location });
  }
}

/**
 * Reads a file and parses it based on its type.
 */
export async function readFile(
  file: string,
  type?: "json" | "toml"
): Promise<any> {
  let content;
  try {
    content = await readFile_(file, { encoding: "utf-8" });
  } catch (err) {
    // TODO: cleanup common Node.js errors that can be confusing (e.g. ENOENT)
    throw new ParseError({
      text: err.message,
      location: {
        file,
      },
    });
  }
  if (type === "json") {
    return parseJSON(content, file);
  }
  if (type === "toml") {
    return parseTOML(content, file);
  }
  return content;
}

/**
 * Calculates the line and column location from an index.
 */
export function indexLocation(
  input: string,
  index: number,
  extra?: Partial<Location>
): Partial<Location> {
  let lineText,
    line = 0,
    column = 0,
    cursor = 0;
  for (const content of input.split("\n")) {
    line++;
    cursor += content.length + 1;
    if (cursor >= index) {
      lineText = content;
      column = content.length - (cursor - index);
      break;
    }
  }
  return { lineText, line, column, ...extra };
}

/**
 * Guesses the line and column location of a search query.
 */
export function searchLocation(
  input: string,
  search: string,
  extra?: Partial<Location>
): Partial<Location> {
  let lineText,
    length,
    line = 0,
    column = 0;
  for (const content of input.split("\n")) {
    line++;
    const index = content.indexOf(search);
    if (index >= 0) {
      lineText = content;
      column = index;
      length = search.length;
      break;
    }
  }
  return { lineText, line, column, length, ...extra };
}

process.on("uncaughtException", (err) => {
  if (err instanceof ParseError) {
    printMessage(err.detail, "error");
  }
});
