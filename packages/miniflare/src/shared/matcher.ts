import globToRegexp from "glob-to-regexp";

import { MatcherRegExps } from "../workers";

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
