import globToRegexp from "glob-to-regexp";
import type { MatcherRegExps } from "../workers";

export function globsToRegExps(
	globs: string[] = [],
	{ endAnchor }: { endAnchor?: boolean } = {}
): MatcherRegExps {
	const include: RegExp[] = [];
	const exclude: RegExp[] = [];
	// Setting `flags: "g"` removes "^" and "$" from the generated regexp,
	// allowing matches anywhere in the path...
	// (https://github.com/fitzgen/glob-to-regexp/blob/2abf65a834259c6504ed3b80e85f893f8cd99127/index.js#L123-L127)
	const opts: globToRegexp.Options = { globstar: true, flags: "g" };
	// When `endAnchor` is true, we re-add the trailing "$" that was stripped.
	// Without it, a pattern like `**/*.wasm` incorrectly matches `foo.wasm.js`
	// since the regex matches `foo.wasm` anywhere inside the string. The leading
	// "^" is intentionally kept absent so the pattern can match anywhere within
	// an absolute path (e.g. `**/*.wasm` still matches `/abs/path/to/foo.wasm`).
	const suffix = endAnchor ? "$" : "";
	for (const glob of globs) {
		// ...however, we don't actually want to include the "g" flag, since it will
		// change `lastIndex` as paths are matched, and we want to reuse `RegExp`s.
		// So, reconstruct each `RegExp` without any flags.
		if (glob.startsWith("!")) {
			exclude.push(
				new RegExp(globToRegexp(glob.slice(1), opts).source + suffix)
			);
		} else {
			include.push(new RegExp(globToRegexp(glob, opts).source + suffix));
		}
	}
	return { include, exclude };
}
