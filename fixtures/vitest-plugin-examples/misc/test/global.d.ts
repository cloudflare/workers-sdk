declare global {
	const WRANGLER_DEFINED_THING: string;
	const WRANGLER_NESTED: { DEFINED: { THING: boolean } };

	const CONFIG_DEFINED_THING: string;
	const CONFIG_NESTED: { DEFINED: { THING: boolean } };
}

export {};
