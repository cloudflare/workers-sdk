import * as React from "react";

interface HighlightTextProps {
	text: string;
	highlight?: string;
}
/**
 * Renders a text string with all case-insensitive occurrences
 * of the `highlight` substring visually emphasized.
 * Each matched segment is wrapped in a styled <span> element.
 *
 * @param text - The full text content to render.
 * @param highlight - The substring to highlight within the text (optional).
 * @returns A JSX element with all matching substrings highlighted.
 */
export const StudioHighlightText = React.memo(
	({ text, highlight }: HighlightTextProps) => {
		// Avoid highlighting if the input is falsy (e.g., null, undefined, or empty string).
		// This also prevents an infinite loop when highlight === "".
		if (!highlight) {
			return <span>{text}</span>;
		}

		const lowerText = text.toLowerCase();
		const lowerHighlight = highlight.toLowerCase();
		const result: React.ReactNode[] = [];

		let i = 0;
		let key = 0;

		while (i < text.length) {
			const matchIndex = lowerText.indexOf(lowerHighlight, i);
			if (matchIndex === -1) {
				result.push(<span key={key++}>{text.slice(i)}</span>);
				break;
			}

			if (matchIndex > i) {
				result.push(<span key={key++}>{text.slice(i, matchIndex)}</span>);
			}

			result.push(
				<span key={key++} className="bg-yellow-300 text-black">
					{text.slice(matchIndex, matchIndex + highlight.length)}
				</span>
			);

			i = matchIndex + highlight.length;
		}

		return <span>{result}</span>;
	}
);

StudioHighlightText.displayName = "StudioHighlightText";
