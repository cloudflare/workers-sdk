// This isn't exact, it's just a basic attempt at matching the compiled VSCode API
declare module "*/workbench.web.main.internal.js" {
	function create(target: HTMLElement, config: Record<string, unknown>): void;
	const URI: {
		revive: (uri: unknown) => unknown;
		parse: (uri: unknown) => unknown;
	};
}
