import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseJSONC } from "@cloudflare/workers-utils";
import { logger } from "../logger";
import { CODEX_MICRO_KEYS } from "./protocol";
import type { CodexMicroKey } from "./protocol";

const KEYMAP_FILE_NAME = "unsupported.codex_micro_keymap.jsonc";

export type CodexMicroKeymap = Partial<Record<CodexMicroKey, string>>;

export function getCodexMicroKeymapPath(homePath = os.homedir()): string {
	return path.join(homePath, ".config", "wrangler", KEYMAP_FILE_NAME);
}

export async function loadCodexMicroKeymap(
	keymapPath = getCodexMicroKeymapPath()
): Promise<CodexMicroKeymap> {
	let contents: string;
	try {
		contents = await readFile(keymapPath, "utf8");
	} catch (error) {
		if (isMissingFileError(error)) {
			return {};
		}
		logger.warn(
			`Codex Micro could not read ${keymapPath}; using the default keymap.`,
			error
		);
		return {};
	}

	try {
		const parsed = parseJSONC(contents, keymapPath);
		if (!isRecord(parsed)) {
			throw new Error("The keymap must be a JSON object.");
		}

		const keymap: CodexMicroKeymap = {};
		for (const key of CODEX_MICRO_KEYS) {
			const action = parsed[key];
			if (typeof action === "string") {
				keymap[key] = action;
			}
		}
		logger.log(`Codex Micro loaded keymap from ${keymapPath}.`);
		return keymap;
	} catch (error) {
		logger.warn(
			`Codex Micro could not load ${keymapPath}; using the default keymap.`,
			error
		);
		return {};
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingFileError(error: unknown): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === "ENOENT"
	);
}
