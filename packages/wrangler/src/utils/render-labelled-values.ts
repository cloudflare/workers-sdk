import { logger } from "../logger";

export default function renderLabelledValues(
	view: Record<string, string>,
	{ print = logger.log as (line: string) => unknown, spacerCount = 2 } = {}
) {
	const alignment =
		Math.max(...Object.keys(view).map((key) => key.length)) + spacerCount;
	for (const [label, value] of Object.entries(view)) {
		const paddedLabel = label.padEnd(alignment);
		const alignedValue = value
			?.split("\n")
			.map((line, lineNo) =>
				lineNo === 0 ? line : " ".repeat(alignment) + line
			)
			.join("\n");

		print(paddedLabel + alignedValue);
	}

	print("");
}
