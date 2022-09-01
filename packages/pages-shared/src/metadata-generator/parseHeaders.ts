import {
	MAX_LINE_LENGTH,
	MAX_HEADER_RULES,
	HEADER_SEPARATOR,
	UNSET_OPERATOR,
} from "./constants";
import { validateUrl } from "./validateURL";
import type { InvalidHeadersRule, ParsedHeaders, HeadersRule } from "./types";

// Not strictly necessary to check for all protocols-like beginnings, since _technically_ that could be a legit header (e.g. name=http, value=://I'm a value).
// But we're checking here since some people might be caught out and it'll help 99.9% of people who get it wrong.
// We do the proper validation in `validateUrl` anyway :)
const LINE_IS_PROBABLY_A_PATH = new RegExp(/^([^\s]+:\/\/|^\/)/);

export function parseHeaders(input: string): ParsedHeaders {
	const lines = input.split("\n");
	const rules: HeadersRule[] = [];
	const invalid: InvalidHeadersRule[] = [];

	let rule: (HeadersRule & { line: string }) | undefined = undefined;

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

		if (LINE_IS_PROBABLY_A_PATH.test(line)) {
			if (rules.length >= MAX_HEADER_RULES) {
				invalid.push({
					message: `Maximum number of rules supported is ${MAX_HEADER_RULES}. Skipping remaining ${
						lines.length - i
					} lines of file.`,
				});
				break;
			}

			if (rule) {
				if (isValidRule(rule)) {
					rules.push({
						path: rule.path,
						headers: rule.headers,
						unsetHeaders: rule.unsetHeaders,
					});
				} else {
					invalid.push({
						line: rule.line,
						lineNumber: i + 1,
						message: "No headers specified",
					});
				}
			}

			const [path, pathError] = validateUrl(line);
			if (pathError) {
				invalid.push({
					line,
					lineNumber: i + 1,
					message: pathError,
				});
				rule = undefined;
				continue;
			}

			rule = {
				path: path as string,
				line,
				headers: {},
				unsetHeaders: [],
			};
			continue;
		}

		if (!line.includes(HEADER_SEPARATOR)) {
			if (!rule) {
				invalid.push({
					line,
					lineNumber: i + 1,
					message: "Expected a path beginning with at least one forward-slash",
				});
			} else {
				if (line.trim().startsWith(UNSET_OPERATOR)) {
					rule.unsetHeaders.push(line.trim().replace(UNSET_OPERATOR, ""));
				} else {
					invalid.push({
						line,
						lineNumber: i + 1,
						message:
							"Expected a colon-separated header pair (e.g. name: value)",
					});
				}
			}
			continue;
		}

		const [rawName, ...rawValue] = line.split(HEADER_SEPARATOR);
		const name = rawName.trim().toLowerCase();

		if (name.includes(" ")) {
			invalid.push({
				line,
				lineNumber: i + 1,
				message: "Header name cannot include spaces",
			});
			continue;
		}

		const value = rawValue.join(HEADER_SEPARATOR).trim();

		if (name === "") {
			invalid.push({
				line,
				lineNumber: i + 1,
				message: "No header name specified",
			});
			continue;
		}

		if (value === "") {
			invalid.push({
				line,
				lineNumber: i + 1,
				message: "No header value specified",
			});
			continue;
		}

		if (!rule) {
			invalid.push({
				line,
				lineNumber: i + 1,
				message: `Path should come before header (${name}: ${value})`,
			});
			continue;
		}

		const existingValues = rule.headers[name];
		rule.headers[name] = existingValues ? `${existingValues}, ${value}` : value;
	}

	if (rule) {
		if (isValidRule(rule)) {
			rules.push({
				path: rule.path,
				headers: rule.headers,
				unsetHeaders: rule.unsetHeaders,
			});
		} else {
			invalid.push({ line: rule.line, message: "No headers specified" });
		}
	}

	return {
		rules,
		invalid,
	};
}

function isValidRule(rule: HeadersRule) {
	return Object.keys(rule.headers).length > 0 || rule.unsetHeaders.length > 0;
}
