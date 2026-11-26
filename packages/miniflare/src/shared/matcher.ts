import { globsToRegExps as compileGlobs } from "@cloudflare/workers-utils/glob-matcher";
import type { MatcherRegExps } from "../workers";

export function globsToRegExps(
	globs: string[] = [],
	options: { endAnchor?: boolean } = {}
): MatcherRegExps {
	return compileGlobs(globs, options);
}
