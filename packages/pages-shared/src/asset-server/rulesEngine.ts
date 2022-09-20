// Taken from https://stackoverflow.com/a/3561711
// which is everything from the tc39 proposal, plus the following two characters: ^/
// It's also everything included in the URLPattern escape (https://wicg.github.io/urlpattern/#escape-a-regexp-string), plus the following: -
// As the answer says, there's no downside to escaping these extra characters, so better safe than sorry
const ESCAPE_REGEX_CHARACTERS = /[-/\\^$*+?.()|[\]{}]/g;
const escapeRegex = (str: string) => {
	return str.replace(ESCAPE_REGEX_CHARACTERS, "\\$&");
};

// Placeholder names must begin with a colon, be alphanumeric and optionally contain underscores.
// e.g. :place_123_holder
const HOST_PLACEHOLDER_REGEX = /(?<=^https:\\\/\\\/[^/]*?):([^\\]+)(?=\\)/g;
const PLACEHOLDER_REGEX = /:(\w+)/g;

export type Replacements = Record<string, string>;

export type Removals = string[];

export const replacer = (str: string, replacements: Replacements) => {
	for (const [replacement, value] of Object.entries(replacements)) {
		str = str.replaceAll(`:${replacement}`, value);
	}
	return str;
};

export const generateRulesMatcher = <T>(
	rules?: Record<string, T>,
	replacerFn: (match: T, replacements: Replacements) => T = (match) => match
) => {
	if (!rules) return () => [];

	const compiledRules = Object.entries(rules)
		.map(([rule, match]) => {
			const crossHost = rule.startsWith("https://");
			const [pathPart, ...queryParts] = rule.split("?");

			// Create :splat capturer then escape.
			rule = rule.split("*").map(escapeRegex).join("(?<splat>.*)");

			// Create :placeholder capturers (already escaped).
			// For placeholders in the host, we separate at forward slashes and periods.
			// For placeholders in the path, we separate at forward slashes.
			// This matches the behavior of URLPattern.
			// e.g. https://:subdomain.domain/ -> https://(here).domain/
			// e.g. /static/:file -> /static/(image.jpg)
			// e.g. /blog/:post -> /blog/(an-exciting-post)
			const host_matches = rule.matchAll(HOST_PLACEHOLDER_REGEX);
			for (const host_match of host_matches) {
				rule = rule.replaceAll(host_match[0], `(?<${host_match[1]}>[^/.]+)`);
			}

			const path_matches = pathPart.matchAll(PLACEHOLDER_REGEX);
			for (const pathMatch of path_matches) {
				rule = rule.replaceAll(pathMatch[0], `(?<${pathMatch[1]}>[^/?]+)`);
			}

			if (queryParts.length > 0) {
				for (let queryPart of queryParts) {
					const original = queryPart;
					queryPart = queryPart.replaceAll("&", ".*&");
					const query_matches = queryPart.matchAll(PLACEHOLDER_REGEX);
					for (const queryMatch of query_matches) {
						queryPart = queryPart.replaceAll(
							queryMatch[0],
							`(?<${queryMatch[1]}>[^&]+)`
						);
					}
					rule = rule.replaceAll(original, ".*" + queryPart + ".*");
				}
			}

			// Wrap in line terminators to be safe.
			rule = "^" + rule + "$";

			try {
				const regExp = new RegExp(rule);
				return [{ crossHost, regExp }, match];
			} catch {}
		})
		.filter((value) => value !== undefined) as [
		{ crossHost: boolean; regExp: RegExp },
		T
	][];

	return ({ request }: { request: Request }) => {
		const { pathname, host, searchParams } = new URL(request.url);
		searchParams.sort();
		const sortedSearch = searchParams.toString();

		return compiledRules
			.map(([{ crossHost, regExp }, match]) => {
				const test = crossHost
					? `https://${host}${pathname}${sortedSearch}`
					: `${pathname}${sortedSearch.length > 0 ? `?${sortedSearch}` : ""}`;
				const result = regExp.exec(test);
				if (result) {
					return replacerFn(match, result.groups || {});
				}
			})
			.filter((value) => value !== undefined) as T[];
	};
};
