/**
 * Directive prefixes recognised by both ESLint and oxlint.
 *
 * Each prefix may optionally be followed by rule names and must contain a
 * description separated by ` -- ` to pass this rule.
 *
 * Covers:
 *   eslint-disable / eslint-disable-next-line
 *   oxlint-disable / oxlint-disable-next-line
 *
 * Note: eslint-enable / oxlint-enable are intentionally excluded — they
 * re-enable rules rather than suppress them, so a justification is not needed.
 */
const DIRECTIVE_PATTERN =
	/^\s*(?:eslint-disable(?:-next-line)?|oxlint-disable(?:-next-line)?)\b/;

/**
 * A description is everything after the first ` -- ` separator. It must
 * contain at least one non-whitespace character to count.
 */
function hasDescription(text) {
	const separatorIndex = text.indexOf("--");
	if (separatorIndex === -1) {
		return false;
	}
	const description = text.slice(separatorIndex + 2);
	return description.trim().length > 0;
}

/**
 * Extract a human-friendly directive name from the comment text so the
 * error message is useful.  e.g. "eslint-disable-next-line"
 */
function getDirectiveName(text) {
	const match = text.match(/\b((?:eslint|oxlint)-disable(?:-next-line)?)\b/);
	return match ? match[1] : "disable directive";
}

export default {
	meta: {
		type: "suggestion",
		docs: {
			description:
				"Require a description after `--` in eslint/oxlint disable directive comments",
			category: "Best Practices",
			recommended: true,
		},
		messages: {
			missingDescription:
				"Unexpected `{{ directive }}` comment without description. Include a description after ` -- ` to explain why the rule is disabled.",
		},
		schema: [],
	},

	create(context) {
		return {
			Program() {
				const sourceCode = context.sourceCode || context.getSourceCode();
				const comments = sourceCode.getAllComments
					? sourceCode.getAllComments()
					: [];

				for (const comment of comments) {
					const text = comment.value;

					if (!DIRECTIVE_PATTERN.test(text)) {
						continue;
					}

					if (!hasDescription(text)) {
						context.report({
							loc: comment.loc,
							messageId: "missingDescription",
							data: {
								directive: getDirectiveName(text),
							},
						});
					}
				}
			},
		};
	},
};
