/**
 * Utilities for drawing box-style CLI sections with Unicode line characters.
 *
 * Usage examples:
 *
 * ```ts
 * // Simple standalone box
 * const output = drawBox([
 *   "Preview: feature-login",
 *   "URL: https://feature-login.example.workers.dev",
 * ]);
 *
 * // Parent box connected to a child box
 * const parent = drawBox(["Preview: feature-login"], { connectToChild: true });
 * const child = drawConnectedChildBox([
 *   "Deployment: 12345",
 *   "Compatibility date: 2025-01-01",
 * ]);
 * ```
 */
const BOX = {
	topLeft: "╭",
	topRight: "╮",
	bottomLeft: "╰",
	bottomRight: "╯",
	horizontal: "─",
	vertical: "│",
	bottomLeftWithConnector: "┬",
	connectorRight: "┤",
} as const;

/**
 * Remove ANSI escape codes from a string.
 */
export function stripAnsi(str: string): string {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Return the display width of a string by ignoring ANSI escape codes.
 */
export function visibleLength(str: string): number {
	return stripAnsi(str).length;
}

/**
 * Pad a string with trailing spaces to match the target visible width.
 * ANSI escape codes in `str` are ignored when computing width.
 */
export function padToVisibleWidth(str: string, width: number): string {
	const visible = visibleLength(str);
	return str + " ".repeat(Math.max(0, width - visible));
}

type DrawBoxOptions = {
	footerLines?: string[];
	connectToChild?: boolean;
};

/**
 * Draw a standalone box around the provided lines.
 *
 * Options:
 * - `footerLines`: additional lines appended at the bottom of the content area
 * - `connectToChild`: render a bottom connector for visual linkage to a child box
 */
export function drawBox(
	contentLines: string[],
	options: DrawBoxOptions = {}
): string {
	const lines = [...contentLines, ...(options.footerLines ?? [])];
	const maxContentWidth = Math.max(...lines.map((line) => visibleLength(line)));
	const boxWidth = maxContentWidth + 4;

	const horizontalLine = BOX.horizontal.repeat(boxWidth - 2);
	const topBorder = `${BOX.topLeft}${horizontalLine}${BOX.topRight}`;
	const bottomBorder = options.connectToChild
		? `${BOX.bottomLeft}${BOX.horizontal}${BOX.bottomLeftWithConnector}${BOX.horizontal.repeat(boxWidth - 4)}${BOX.bottomRight}`
		: `${BOX.bottomLeft}${horizontalLine}${BOX.bottomRight}`;

	const paddedLines = lines.map((line) => {
		const paddedContent = padToVisibleWidth(line, maxContentWidth);
		return `${BOX.vertical} ${paddedContent} ${BOX.vertical}`;
	});

	return [topBorder, ...paddedLines, bottomBorder].join("\n");
}

type DrawConnectedChildBoxOptions = {
	indent?: string;
	footerLines?: string[];
	connectorLineIndex?: number;
};

/**
 * Draw a child box that visually connects to an upstream parent box.
 *
 * Options:
 * - `indent`: left indentation before the connector and box (default: two spaces)
 * - `footerLines`: additional lines appended at the bottom of the content area
 * - `connectorLineIndex`: line index where the horizontal connector joins the box
 */
export function drawConnectedChildBox(
	contentLines: string[],
	options: DrawConnectedChildBoxOptions = {}
): string {
	const indent = options.indent ?? "  ";
	const lines = [...contentLines, ...(options.footerLines ?? [])];

	const maxContentWidth = Math.max(...lines.map((line) => visibleLength(line)));
	const boxWidth = maxContentWidth + 4;

	const horizontalLine = BOX.horizontal.repeat(boxWidth - 2);
	const topBorder = `${BOX.topLeft}${horizontalLine}${BOX.topRight}`;
	const bottomBorder = `${BOX.bottomLeft}${horizontalLine}${BOX.bottomRight}`;

	const paddedLines = lines.map((line) => {
		const paddedContent = padToVisibleWidth(line, maxContentWidth);
		return `${BOX.vertical} ${paddedContent} ${BOX.vertical}`;
	});

	const connectorIndex =
		options.connectorLineIndex ?? Math.floor(paddedLines.length / 2);

	const result: string[] = [];
	result.push(`${indent}${BOX.vertical}`);
	result.push(`${indent}${BOX.vertical} ${topBorder}`);

	paddedLines.forEach((line, index) => {
		if (index === connectorIndex) {
			result.push(
				`${indent}${BOX.bottomLeft}${BOX.horizontal}${BOX.connectorRight}${line.slice(1)}`
			);
		} else if (index < connectorIndex) {
			result.push(`${indent}${BOX.vertical} ${line}`);
		} else {
			result.push(`${indent}  ${line}`);
		}
	});

	result.push(`${indent}  ${bottomBorder}`);

	return result.join("\n");
}
