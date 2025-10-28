import { formatMessagesSync } from "esbuild";
import { logger } from "../logger";
import type { Message } from "@cloudflare/workers-utils";

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
		terminalWidth: logger.columns,
	});
	return lines.join("\n");
}
