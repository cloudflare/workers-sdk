import { stripVTControlCharacters } from "node:util";
import { gray, white } from "@cloudflare/cli/colors";

type Options = {
	/** Hook to format each label. This is a convenience option to avoid manually formatting each label. */
	formatLabel?: (label: string) => string;
	/** Hook to format each value. This is a convenience option to avoid manually formatting each value. */
	formatValue?: (value: string) => string;
	/** The number of spaces to add between the label and value. */
	spacerCount?: number;
	/** The number of spaces to indent each line by. Useful for when nesting outputs of formatLabelledValues. */
	indentationCount?: number;
	/** Used to pad the end of each label so the values are aligned. Automatically calculated based on longest label length without ANSI -- if formatting many items any/or the items have many values, set manually for a minor perf boost. */
	valuesAlignmentColumn?: number;
	/** The string to use to separate each line. */
	lineSeparator?: string;
	/** Controls whether the labels are aligned with left- or right-justification */
	labelJustification?: "left" | "right";
};

/**
 * Render a set of labelled values into a string with the values aligned
 */
export default function formatLabelledValues(
	view: Record<string, string>,
	{
		formatLabel = (label) => white(label + ":"),
		formatValue = (value) => gray(value),
		spacerCount = 2,
		indentationCount = 0,
		valuesAlignmentColumn: valuesAlignment = Math.max(
			...Object.keys(view).map(
				(label) => stripVTControlCharacters(formatLabel(label)).length
			)
		),
		lineSeparator = "\n",
		labelJustification = "left",
	}: Options = {}
): string {
	const labelLengthsWithoutANSI = Object.keys(view).map(
		(label) => stripVTControlCharacters(formatLabel(label)).length
	);

	const formattedLines = Object.entries(view).map(([label, value], i) => {
		const indentation = indentationCount ? " ".repeat(indentationCount) : "";
		const labelAlignment =
			labelJustification === "left"
				? ""
				: " ".repeat(valuesAlignment - labelLengthsWithoutANSI[i]);
		const formattedAndAlignedLabel = labelAlignment + formatLabel(label);
		const formattedAndAlignedMultilineValue = formatValue(value)
			.split("\n")
			.map((line, lineNo) => {
				const prefixSpacing = " ".repeat(
					lineNo === 0
						? valuesAlignment +
								spacerCount -
								labelLengthsWithoutANSI[i] -
								labelAlignment.length
						: valuesAlignment + spacerCount + indentationCount
				);

				return prefixSpacing + line;
			})
			.join("\n");

		return (
			indentation + formattedAndAlignedLabel + formattedAndAlignedMultilineValue
		);
	});

	const output = formattedLines.join(lineSeparator);

	return collapseWhiteSpaceLines(output);
}

/**
 * Return the input as-is except with lines of only whitespace characters replaced with blank lines.
 * This won't be noticeable to users. It's mainly to prevent prettier from causing snapshot diffs.
 */
function collapseWhiteSpaceLines(input: string) {
	return input.replaceAll(/^\s+$/gm, "");
}
