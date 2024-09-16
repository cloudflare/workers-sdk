export const frameworks = [
	"astro",
	"docusaurus",
	"analog",
	"angular",
	"gatsby",
	"hono",
	"qwik",
	"remix",
	"next",
	"nuxt",
	"react",
	"solid",
	"svelte",
	"vue",
] as const;
type Framework = (typeof frameworks)[number];
export const frameworkMap = Object.fromEntries(
	frameworks.map((f) => [f, f]),
) as Record<Framework, string>;
