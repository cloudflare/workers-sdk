import {
	MAX_LINE_LENGTH,
	MAX_DYNAMIC_REDIRECT_RULES,
	MAX_STATIC_REDIRECT_RULES,
	PERMITTED_STATUS_CODES,
	SPLAT_REGEX,
	PLACEHOLDER_REGEX,
} from "./constants";
import { validateUrl, urlHasHost } from "./validateURL";
import type {
	InvalidRedirectRule,
	ParsedRedirects,
	RedirectLine,
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

		if (tokens.length < 2 || tokens.length > 3) {
			invalid.push({
				line,
				lineNumber: i + 1,
				message: `Expected exactly 2 or 3 whitespace-separated tokens. Got ${tokens.length}.`,
			});
			continue;
		}

		const [str_from, str_to, str_status = "302"] = tokens as RedirectLine;

		const fromResult = validateUrl(str_from, true, false, false);
		if (fromResult[0] === undefined) {
			invalid.push({
				line,
				lineNumber: i + 1,
				message: fromResult[1],
			});
			continue;
		}
		const from = fromResult[0];

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
				message: `Valid status codes are 200, 301, 302 (default), 303, 307, or 308. Got ${str_status}.`,
			});
			continue;
		}

		// We want to always block the `/* /index.html` redirect - this will cause TOO_MANY_REDIRECTS errors as
		// the asset server will redirect it back to `/`, removing the `/index.html`. This is the case for regular
		// redirects, as well as proxied (200) rewrites. We only want to run this on relative urls
		if (/\/\*?$/.test(from) && /\/index(.html)?$/.test(to) && !urlHasHost(to)) {
			invalid.push({
				line,
				lineNumber: i + 1,
				message:
					'This behaviour is default with Cloudflare Pages (when a 404.html isn\'t present) and will be ignored. Remove it from your _redirects to silence this warning.\nIf you wish to direct requests to a subfolder, for example, sending all requests to foo/index.html, you should use "/* /foo/".',
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

		if (status === 200) {
			if (urlHasHost(to)) {
				invalid.push({
					line,
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
