declare module "@cloudflare/workers-shared/asset-worker/src/utils/rules-engine" {
	export function generateRulesMatcher<T>(
		rules?: Record<string, T>,
		replacerFn: (match: T, replacements: Replacements) => T = (match) => match
	): ({ request }: { request: Request }) => T[];
	export function replacer(str: string, replacements: Replacements): string;
	export function generateStaticRoutingRuleMatcher(
		rules: string[]
	): ({ request }: { request: Request }) => boolean;
}
