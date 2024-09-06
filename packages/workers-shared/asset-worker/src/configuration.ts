export interface Configuration {
	serveExactMatchesOnly: boolean;
	trailingSlashes: "auto" | "add" | "remove";
	notFoundBehavior:
		| "default"
		| "single-page-application"
		| "404-page"
		| "nearest-404-page";
}

export const applyConfigurationDefaults = (
	configuration?: Partial<Configuration>
): Configuration => {
	return {
		serveExactMatchesOnly: configuration?.serveExactMatchesOnly ?? false,
		trailingSlashes: configuration?.trailingSlashes ?? "auto",
		notFoundBehavior: configuration?.notFoundBehavior ?? "default",
	};
};
