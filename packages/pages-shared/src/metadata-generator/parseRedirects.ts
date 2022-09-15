import {
	MAX_LINE_LENGTH,
	MAX_DYNAMIC_REDIRECT_RULES,
	MAX_STATIC_REDIRECT_RULES,
	PERMITTED_STATUS_CODES,
	SPLAT_REGEX,
	PLACEHOLDER_REGEX,
} from "./constants";
import { validateUrl } from "./validateURL";
import type {
	InvalidRedirectRule,
	ParsedRedirects,
	RedirectRule,
} from "./types";

export function parseRedirects(input: string): ParsedRedirects {
	const lines = input.split("\n");
	const rules: RedirectRule[] = [];
	const seen_paths = new Set<string>();
	const invalid: InvalidRedirectRule[] = [];

	let staticRules = 0;
	let dynamicRules = 0;
	let canCreateStaticRule = true;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (line.length === 0 || line.startsWith("#")) continue;

		if (line.length > MAX_LINE_LENGTH) {
			invalid.push({
				message: `Ignoring line ${
					i + 1
				} as it exceeds the maximum allowed length of ${MAX_LINE_LENGTH}.`,
			});
			continue;
		}

		const tokens = line.split(/\s+/);

		if (tokens.length < 2) {
			invalid.push({
				line,
				lineNumber: i + 1,
				message: `Expected at least 2 whitespace-separated tokens. Got ${tokens.length}.`,
			});
			continue;
		}

		const str_from = tokens[0];

		let str_status: number | undefined = parseInt(tokens[tokens.length - 1]);
		let index = tokens.length - 1;
		if (str_status && !isNaN(str_status)) {
			index = tokens.length - 2;
		} else {
			str_status = 302;
		}
		const str_to = tokens[index];

		const fromResult = validateUrl(str_from, true, false, false);
		if (fromResult[0] === undefined) {
			invalid.push({
				line,
				lineNumber: i + 1,
				message: fromResult[1],
			});
			continue;
		}
		let from = fromResult[0];
		const queryParams = tokens.slice(1, index);
		const hasInvalidQueryParam = queryParams.some((token) =>
			token.includes("&")
		);
		if (hasInvalidQueryParam) {
			invalid.push({
				line,
				lineNumber: i + 1,
				message: "Query parameters cannot contain '&'.",
			});
			continue;
		}

		if (queryParams.length) {
			from = `${from}?${queryParams.join("&")}`;
		}

		if (
			canCreateStaticRule &&
			!from.match(SPLAT_REGEX) &&
			!from.match(PLACEHOLDER_REGEX)
		) {
			staticRules += 1;

			if (staticRules > MAX_STATIC_REDIRECT_RULES) {
				invalid.push({
					message: `Maximum number of static rules supported is ${MAX_STATIC_REDIRECT_RULES}. Skipping line.`,
				});
				continue;
			}
		} else {
			dynamicRules += 1;
			canCreateStaticRule = false;

			if (dynamicRules > MAX_DYNAMIC_REDIRECT_RULES) {
				invalid.push({
					message: `Maximum number of dynamic rules supported is ${MAX_DYNAMIC_REDIRECT_RULES}. Skipping remaining ${
						lines.length - i
					} lines of file.`,
				});
				break;
			}
		}

		const toResult = validateUrl(str_to, false, true, true);
		if (toResult[0] === undefined) {
			invalid.push({
				line,
				lineNumber: i + 1,
				message: toResult[1],
			});
			continue;
		}
		const to = toResult[0];

		const status = Number(str_status);
		if (isNaN(status) || !PERMITTED_STATUS_CODES.has(status)) {
			invalid.push({
				line,
				lineNumber: i + 1,
				message: `Valid status codes are 301, 302 (default), 303, 307, or 308. Got ${status}.`,
			});
			continue;
		}

		if (seen_paths.has(from)) {
			invalid.push({
				line,
				lineNumber: i + 1,
				message: `Ignoring duplicate rule for path ${from}.`,
			});
			continue;
		}
		seen_paths.add(from);

		rules.push({ from, to, status, lineNumber: i + 1 });
	}

	return {
		rules,
		invalid,
	};
}
