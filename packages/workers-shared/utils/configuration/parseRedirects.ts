import {
	MAX_REDIRECT_DYNAMIC_RULES,
	MAX_REDIRECT_LINE_LENGTH,
	MAX_REDIRECT_STATIC_RULES,
	REDIRECT_PERMITTED_STATUS_CODES,
	REDIRECT_PLACEHOLDER_REGEX,
	REDIRECT_SPLAT_REGEX,
} from "./constants";
import { urlHasHost, validateUrl } from "./validateURL";
import type { AssetConfig } from "../types";
import type {
	InvalidRedirectRule,
	ParsedRedirects,
	RedirectLine,
	RedirectRule,
} from "./types";

export function parseRedirects(
	input: string,
	{
		htmlHandling = undefined,
		maxStaticRules = MAX_REDIRECT_STATIC_RULES,
		maxDynamicRules = MAX_REDIRECT_DYNAMIC_RULES,
		maxLineLength = MAX_REDIRECT_LINE_LENGTH,
	}: {
		htmlHandling?: AssetConfig["html_handling"];
		maxStaticRules?: number;
		maxDynamicRules?: number;
		maxLineLength?: number;
	} = {}
): ParsedRedirects {
	const lines = input.split("\n");
	const rules: RedirectRule[] = [];
	const seen_paths = new Set<string>();
	const invalid: InvalidRedirectRule[] = [];

	let staticRules = 0;
	let dynamicRules = 0;
	let canCreateStaticRule = true;

	for (let i = 0; i < lines.length; i++) {
		const sourceLine = lines[i] ?? "";
		const lineWithoutComment = sourceLine
			.trim()
			// Strips # comments but allows # in URLs, e.g. `/from /to#fragment`
			.replace(/(^|\s+)#.*$/, "");

		if (lineWithoutComment.length === 0) {
			continue;
		}

		if (lineWithoutComment.length > maxLineLength) {
			invalid.push({
				message: `Ignoring line ${
					i + 1
				} as the redirect directive exceeds the maximum allowed length of ${maxLineLength}.`,
			});
			continue;
		}

		const tokens = lineWithoutComment.split(/\s+/);

		if (tokens.length < 2 || tokens.length > 3) {
			invalid.push({
				line: sourceLine,
				lineNumber: i + 1,
				message: `Expected exactly 2 or 3 whitespace-separated tokens. Got ${tokens.length}.`,
			});
			continue;
		}

		const [str_from, str_to, str_status = "302"] = tokens as RedirectLine;

		const fromResult = validateUrl(str_from, true, true, false, false);
		if (fromResult[0] === undefined) {
			invalid.push({
				line: sourceLine,
				lineNumber: i + 1,
				message: fromResult[1],
			});
			continue;
		}
		const from = fromResult[0];

		if (
			canCreateStaticRule &&
			!from.match(REDIRECT_SPLAT_REGEX) &&
			!from.match(REDIRECT_PLACEHOLDER_REGEX)
		) {
			staticRules += 1;

			if (staticRules > maxStaticRules) {
				invalid.push({
					message: `Maximum number of static rules supported is ${maxStaticRules}. Skipping line.`,
				});
				continue;
			}
		} else {
			dynamicRules += 1;
			canCreateStaticRule = false;

			if (dynamicRules > maxDynamicRules) {
				invalid.push({
					message: `Maximum number of dynamic rules supported is ${maxDynamicRules}. Skipping remaining ${
						lines.length - i
					} lines of file.`,
				});
				break;
			}
		}

		const toResult = validateUrl(str_to, false, false, true, true);
		if (toResult[0] === undefined) {
			invalid.push({
				line: sourceLine,
				lineNumber: i + 1,
				message: toResult[1],
			});
			continue;
		}
		const to = toResult[0];

		const status = Number(str_status);
		if (isNaN(status) || !REDIRECT_PERMITTED_STATUS_CODES.has(status)) {
			invalid.push({
				line: sourceLine,
				lineNumber: i + 1,
				message: `Valid status codes are 200, 301, 302 (default), 303, 307, or 308. Got ${str_status}.`,
			});
			continue;
		}

		// Here we reject two patterns:
		// 1. `/* /index.html` Is always rejected.
		// 2. `/ /index` Is rejected when HTML handling is enabled.
		// Allowing the redirect in other cases will cause TOO_MANY_REDIRECTS errors as the asset Worker will
		// redirect it back to `/` by removing the `/index.html`.
		// We only want to run this on relative URLs.
		const hasRelativePath = !urlHasHost(to);
		const hasWildcardToIndex =
			/\/\*$/.test(from) && /\/index(.html)?$/.test(to);
		const hasRootToIndex = /\/$/.test(from) && /\/index(.html)?$/.test(to);
		const hasHTMLHandling = htmlHandling !== "none"; // HTML handling is enabled by default.
		if (
			hasRelativePath &&
			(hasWildcardToIndex || (hasRootToIndex && hasHTMLHandling))
		) {
			invalid.push({
				line: sourceLine,
				lineNumber: i + 1,
				message:
					"Infinite loop detected in this rule and has been ignored. This will cause a redirect to strip `.html` or `/index` and end up triggering this rule again. Please fix or remove this rule to silence this warning.",
			});
			continue;
		}

		if (seen_paths.has(from)) {
			invalid.push({
				line: sourceLine,
				lineNumber: i + 1,
				message: `Ignoring duplicate rule for path ${from}.`,
			});
			continue;
		}
		seen_paths.add(from);

		if (status === 200) {
			if (urlHasHost(to)) {
				invalid.push({
					line: sourceLine,
					lineNumber: i + 1,
					message: `Proxy (200) redirects can only point to relative paths. Got ${to}`,
				});
				continue;
			}
		}

		rules.push({ from, to, status, lineNumber: i + 1 });
	}

	return {
		rules,
		invalid,
	};
}
