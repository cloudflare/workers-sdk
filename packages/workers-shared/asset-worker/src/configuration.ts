export interface Configuration {
	htmlHandling:
		| "auto-trailing-slash"
		| "force-trailing-slash"
		| "drop-trailing-slash"
		| "none";
	notFoundHandling: "single-page-application" | "404-page" | "none";
}

export const applyConfigurationDefaults = (
	configuration?: Partial<Configuration>
): Configuration => {
	return {
		htmlHandling: configuration?.htmlHandling ?? "auto-trailing-slash",
		notFoundHandling: configuration?.notFoundHandling ?? "none",
	};
};
