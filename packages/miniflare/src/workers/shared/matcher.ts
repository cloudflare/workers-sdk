// Split conversion to RegExps and testing to allow RegExps to be serialised
// into Workers Sites KV namespace script. This will apply filtering, before
// passing back to Miniflare's loopback server for storage access.
export interface MatcherRegExps {
	include: RegExp[];
	exclude: RegExp[];
}

export function testRegExps(matcher: MatcherRegExps, value: string): boolean {
	for (const exclude of matcher.exclude) if (exclude.test(value)) return false;
	for (const include of matcher.include) if (include.test(value)) return true;
	return false;
}
