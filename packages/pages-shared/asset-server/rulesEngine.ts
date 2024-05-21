// Taken from https://stackoverflow.com/a/3561711
// which is everything from the tc39 proposal, plus the following two characters: ^/
// It's also everything included in the URLPattern escape (https://wicg.github.io/urlpattern/#escape-a-regexp-string), plus the following: -
// As the answer says, there's no downside to escaping these extra characters, so better safe than sorry
const ESCAPE_REGEX_CHARACTERS = /[-/\\^$*+?.()|[\]{}]/g;
const escapeRegex = (str: string) => {
	return str.replace(ESCAPE_REGEX_CHARACTERS, "\\$&");
};

// Placeholder names must begin with a colon then a letter, be alphanumeric and optionally contain underscores.
// e.g. :place_123_holder
const HOST_PLACEHOLDER_REGEX =
	/(?<=^https:\\\/\\\/[^/]*?):([A-Za-z]\w*)(?=\\)/g;
const PLACEHOLDER_REGEX = /:([A-Za-z]\w*)/g;

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
	if (!rules) {
		return () => [];
	}

	const compiledRules = Object.entries(rules)
		.map(([rule, match]) => {
			const crossHost = rule.startsWith("https://");

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
				rule = rule.split(host_match[0]).join(`(?<${host_match[1]}>[^/.]+)`);
			}

			const path_matches = rule.matchAll(PLACEHOLDER_REGEX);
			for (const path_match of path_matches) {
				rule = rule.split(path_match[0]).join(`(?<${path_match[1]}>[^/]+)`);
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
		T,
	][];

	return ({ request }: { request: Request }) => {
		const { pathname, hostname } = new URL(request.url);

		return compiledRules
			.map(([{ crossHost, regExp }, match]) => {
				// This, rather confusingly, means that although we enforce `https://` protocols in
				// the rules of `_headers`/`_redirects`, we don't actually respect that at all at runtime.
				// When processing a request against an absolute URL rule, we rewrite the protocol to `https://`.
				// This has the benefit of ensuring attackers can't specify a different protocol
				// to circumvent a developer's security rules (e.g. CORS), but it isn't obvious behavior.
				// We should consider different syntax in the future for developers when they specify rules.
				// For example, `*://example.com/path`, `://example.com/path` or `//example.com/`.
				// Though we'd need to be careful with that last one
				// as that would currently be read as a relative URL.
				// Perhaps, if we ever move the `_headers`/`_redirects` files to acting ahead of Functions,
				// this might be a good time for this change.
				const test = crossHost ? `https://${hostname}${pathname}` : pathname;
				const result = regExp.exec(test);
				if (result) {
					return replacerFn(match, result.groups || {});
				}
			})
			.filter((value) => value !== undefined) as T[];
	};
};
