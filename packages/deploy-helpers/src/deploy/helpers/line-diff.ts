import { log } from "@cloudflare/cli-shared-helpers";
import { green, red } from "@cloudflare/cli-shared-helpers/colors";

type DiffPart = {
	type: "equal" | "added" | "removed";
	lines: string[];
};

/**
 * Small line-oriented diff used for displaying rendered config changes.
 */
export class Diff {
	readonly #parts: DiffPart[];

	get changes(): number {
		return this.#parts.filter((part) => part.type !== "equal").length;
	}

	constructor(previous: string, next: string) {
		this.#parts = groupOperations(
			diffLines(splitLines(previous), splitLines(next))
		);
	}

	toString(
		options: {
			contextLines: number;
		} = {
			contextLines: 3,
		}
	): string {
		let output = "";
		let state: "init" | "diff" = "init";
		const context: string[] = [];

		for (const part of this.#parts) {
			if (part.type === "equal") {
				context.push(...part.lines);
				continue;
			}

			if (state === "diff") {
				context
					.splice(0, options.contextLines)
					.filter(Boolean)
					.forEach((line) => {
						output += `  ${line}\n`;
					});

				if (context.length > options.contextLines) {
					output += "\n  ...\n\n";
				}
			}

			context.splice(0, context.length - options.contextLines);
			if (state === "init") {
				while (context.length > 0 && context[0]?.trim() === "") {
					context.shift();
				}
			}

			context.filter(Boolean).forEach((line) => {
				output += `  ${line}\n`;
			});
			context.length = 0;

			for (const line of part.lines) {
				if (line) {
					output += `${part.type === "added" ? green("+") : red("-")} ${line}\n`;
				}
			}

			state = "diff";
		}

		if (state === "diff") {
			context.splice(options.contextLines);
			while (
				context.length > 0 &&
				context[context.length - 1]?.trim() === ""
			) {
				context.pop();
			}

			context.filter(Boolean).forEach((line) => {
				output += `  ${line}\n`;
			});
		}

		return output.replace(/\n$/, "");
	}

	print(options?: { contextLines: number }): void {
		log(this.toString(options));
	}
}

function splitLines(value: string): string[] {
	const lines = value.split(/\r?\n/);
	if (lines.at(-1) === "") {
		lines.pop();
	}
	return lines;
}

function diffLines(previous: string[], next: string[]): DiffPart[] {
	const lengths = Array.from({ length: previous.length + 1 }, () =>
		Array.from({ length: next.length + 1 }, () => 0)
	);

	for (let i = previous.length - 1; i >= 0; i--) {
		for (let j = next.length - 1; j >= 0; j--) {
			lengths[i][j] =
				previous[i] === next[j]
					? lengths[i + 1][j + 1] + 1
					: Math.max(lengths[i + 1][j], lengths[i][j + 1]);
		}
	}

	const parts: DiffPart[] = [];
	let i = 0;
	let j = 0;
	while (i < previous.length && j < next.length) {
		if (previous[i] === next[j]) {
			parts.push({ type: "equal", lines: [previous[i]] });
			i++;
		} else if (previous[i] === next[j + 1]) {
			parts.push({ type: "added", lines: [next[j]] });
		} else if (previous[i + 1] === next[j]) {
			parts.push({ type: "removed", lines: [previous[i]] });
			i++;
			continue;
		} else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
			parts.push({ type: "removed", lines: [previous[i]] });
			i++;
			continue;
		} else {
			parts.push({ type: "added", lines: [next[j]] });
		}
		j++;
	}

	while (i < previous.length) {
		parts.push({ type: "removed", lines: [previous[i]] });
		i++;
	}

	while (j < next.length) {
		parts.push({ type: "added", lines: [next[j]] });
		j++;
	}

	return parts;
}

function groupOperations(parts: DiffPart[]): DiffPart[] {
	const grouped: DiffPart[] = [];

	for (const part of parts) {
		const previous = grouped.at(-1);
		if (previous?.type === part.type) {
			previous.lines.push(...part.lines);
		} else {
			grouped.push({ type: part.type, lines: [...part.lines] });
		}
	}

	return grouped;
}
