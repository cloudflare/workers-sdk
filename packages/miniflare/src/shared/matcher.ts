import globToRegexp from "glob-to-regexp";

// Split conversion to RegExps and testing to allow RegExps to be serialised
// into Workers Sites KV namespace script. This will apply filtering, before
// passing back to Miniflare's loopback server for storage access.
export interface MatcherRegExps {
	include: RegExp[];
	exclude: RegExp[];
}

export interface SerialisableMatcherRegExps {
	include: string[];
	exclude: string[];
}

export function globsToRegExps(globs: string[] = []): MatcherRegExps {
	const include: RegExp[] = [];
	const exclude: RegExp[] = [];
	// Setting `flags: "g"` removes "^" and "$" from the generated regexp,
	// allowing matches anywhere in the path...
	// (https://github.com/fitzgen/glob-to-regexp/blob/2abf65a834259c6504ed3b80e85f893f8cd99127/index.js#L123-L127)
	const opts: globToRegexp.Options = { globstar: true, flags: "g" };
	for (const glob of globs) {
		// ...however, we don't actually want to include the "g" flag, since it will
		// change `lastIndex` as paths are matched, and we want to reuse `RegExp`s.
		// So, reconstruct each `RegExp` without any flags.
		if (glob.startsWith("!")) {
			exclude.push(new RegExp(globToRegexp(glob.slice(1), opts), ""));
		} else {
			include.push(new RegExp(globToRegexp(glob, opts), ""));
		}
	}
	return { include, exclude };
}

// NOTE: this function will be `toString()`ed and must not have dependencies
export function testRegExps(matcher: MatcherRegExps, value: string): boolean {
	for (const exclude of matcher.exclude) if (exclude.test(value)) return false;
	for (const include of matcher.include) if (include.test(value)) return true;
	return false;
}

function serialiseRegExp(regExp: RegExp): string {
	const str = regExp.toString();
	return str.substring(str.indexOf("/") + 1, str.lastIndexOf("/"));
}
export function serialiseRegExps(
	matcher: MatcherRegExps
): SerialisableMatcherRegExps {
	return {
		include: matcher.include.map(serialiseRegExp),
		exclude: matcher.exclude.map(serialiseRegExp),
	};
}

// NOTE: this function will be `toString()`ed and must not have dependencies
export function deserialiseRegExps(
	matcher: SerialisableMatcherRegExps
): MatcherRegExps {
	return {
		include: matcher.include.map((regExp) => new RegExp(regExp)),
		exclude: matcher.exclude.map((regExp) => new RegExp(regExp)),
	};
}
