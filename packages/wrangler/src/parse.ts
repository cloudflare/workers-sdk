import * as fs from "node:fs";
import { resolve } from "node:path";
import TOML from "@iarna/toml";
import { formatMessagesSync } from "esbuild";

export type Message = {
  text: string;
  location?: Location;
  notes?: Message[];
  kind?: "warning" | "error";
};

export type Location = File & {
  line: number;
  column: number;
  length?: number;
  lineText?: string;
  suggestion?: string;
};

export type File = {
  file?: string;
  fileText?: string;
};

/**
 * Formats a `Message` using esbuild's pretty-printing algorithm.
 */
export function formatMessage(
  { text, notes, location, kind = "error" }: Message,
  color = true
): string {
  const input = { text, notes, location };
  delete input.location?.fileText;
  for (const note of notes ?? []) {
    delete note.location?.fileText;
  }
  const lines = formatMessagesSync([input], {
    color,
    kind: kind,
    terminalWidth: process.stderr.columns,
  });
  return lines.join("\n");
}

/**
 * An error that's thrown when something fails to parse.
 */
export class ParseError extends Error implements Message {
  readonly text: string;
  readonly notes: Message[];
  readonly location?: Location;
  readonly kind: "warning" | "error";

  constructor({ text, notes, location, kind }: Message) {
    super(text);
    this.name = this.constructor.name;
    this.text = text;
    this.notes = notes ?? [];
    this.location = location;
    this.kind = kind ?? "error";
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */

const TOML_ERROR_NAME = "TomlError";
const TOML_ERROR_SUFFIX = " at row ";

type TomlError = Error & {
  line: number;
  col: number;
};

/**
 * A wrapper around `TOML.parse` that throws a `ParseError`.
 */
export function parseTOML(input: string, file?: string): object {
  try {
    return TOML.parse(input);
  } catch (err) {
    const { name, message, line, col } = err as TomlError;
    if (name !== TOML_ERROR_NAME) {
      throw err;
    }
    const text = message.substring(0, message.lastIndexOf(TOML_ERROR_SUFFIX));
    const lineText = input.split("\n")[line];
    const location = {
      lineText,
      line: line + 1,
      column: col - 1,
      file,
      fileText: input,
    };
    throw new ParseError({ text, location });
  }
}

const JSON_ERROR_SUFFIX = " in JSON at position ";

/**
 * A wrapper around `JSON.parse` that throws a `ParseError`.
 */
export function parseJSON(input: string, file?: string): any {
  try {
    return JSON.parse(input);
  } catch (err) {
    const { message } = err as Error;
    const index = message.lastIndexOf(JSON_ERROR_SUFFIX);
    if (index < 0) {
      throw err;
    }
    const text = message.substring(0, index);
    const position = parseInt(
      message.substring(index + JSON_ERROR_SUFFIX.length)
    );
    const location = indexLocation({ file, fileText: input }, position);
    throw new ParseError({ text, location });
  }
}

/**
 * Reads a file and parses it based on its type.
 */
export function readFileSync(file: string): string {
  try {
    return fs.readFileSync(file, { encoding: "utf-8" });
  } catch (err) {
    const { message } = err as Error;
    throw new ParseError({
      text: `Could not read file: ${file}`,
      notes: [
        {
          text: message.replace(file, resolve(file)),
        },
      ],
    });
  }
}

/**
 * Calculates the line and column location from an index.
 */
export function indexLocation(file: File, index: number): Location {
  let lineText,
    line = 0,
    column = 0,
    cursor = 0;
  const { fileText = "" } = file;
  for (const row of fileText.split("\n")) {
    line++;
    cursor += row.length + 1;
    if (cursor >= index) {
      lineText = row;
      column = row.length - (cursor - index);
      break;
    }
  }
  return { lineText, line, column, ...file };
}

/**
 * Guesses the line and column location of a search query.
 */
export function searchLocation(file: File, query: unknown): Location {
  let lineText,
    length,
    line = 0,
    column = 0;
  const queryText = String(query);
  const { fileText = "" } = file;
  for (const content of fileText.split("\n")) {
    line++;
    const index = content.indexOf(queryText);
    if (index >= 0) {
      lineText = content;
      column = index;
      length = queryText.length;
      break;
    }
  }
  return { lineText, line, column, length, ...file };
}
