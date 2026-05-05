export function multiEnvWarning(command: string): string {
	return `
		"[33m▲ [43;33m[[43;30mWARNING[43;33m][0m [1mMultiple environments are defined in the Wrangler configuration file, but no target environment was specified for the ${command} command.[0m

		  To avoid unintentional changes to the wrong environment, it is recommended to explicitly specify
		  the target environment using the \`-e|--env\` flag or CLOUDFLARE_ENV env variable.
		  If your intention is to use the top-level environment of your configuration simply pass an empty
		  string to the flag to target such environment. For example \`--env=""\`.

		"
	`;
}
