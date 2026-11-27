/**
 * An Artifacts binding as far as its development default is concerned.
 */
export interface ArtifactsDevBinding {
	/** The binding name, such as `REPOS`. */
	name: string;
	/** The binding's configured `remote` setting. */
	remote: boolean | undefined;
	/**
	 * The Worker that declares the binding. Set it when a config declares
	 * several Workers, so the warning says which one it means.
	 */
	worker?: string;
}

/**
 * Warns about Artifacts bindings that use the local simulator only because
 * `remote` is omitted.
 *
 * @param project Identifies the project the bindings come from, such as its
 * config path or root. Warnings are remembered per project, so two projects in
 * one process each get their own.
 */
export type ArtifactsLocalDefaultWarner = (
	project: { id: string; bindings: Iterable<ArtifactsDevBinding> },
	warn: (message: string) => void
) => void;

/**
 * Artifacts bindings used deployed repos by default during development, and
 * now use the local simulator like every other binding. Someone who relied on
 * the old default would silently stop seeing their deployed repos, so warn
 * about an omitted `remote` where the default changed: development sessions
 * with remote bindings enabled. Workers Vitest and `--local` sessions already
 * used the simulator, so their callers don't warn.
 *
 * The returned warner warns once per project, Worker and binding, so a session
 * that reloads its config doesn't repeat the warning.
 *
 * TODO: Remove when Artifacts is generally available.
 *
 * @param configFormat Which config format the bindings come from, so the
 * warning names the setting the user can write: `remote` in a Wrangler config,
 * `dev: { remote }` in `cloudflare.config.ts`.
 */
export function createArtifactsLocalDefaultWarner(
	configFormat: "wrangler" | "cloudflare-config"
): ArtifactsLocalDefaultWarner {
	const remoteSetting = (value: boolean) =>
		configFormat === "cloudflare-config"
			? `\`dev: { remote: ${value} }\``
			: `\`remote: ${value}\``;
	const warned = new Set<string>();
	return ({ id, bindings }, warn) => {
		for (const { name, remote, worker } of bindings) {
			// JSON keeps the parts apart whatever characters they contain.
			const key = JSON.stringify([id, worker ?? null, name]);
			if (remote !== undefined || warned.has(key)) {
				continue;
			}
			warned.add(key);
			const subject =
				worker === undefined ? name : `${name} in Worker ${worker}`;
			warn(
				`Artifacts binding ${subject} uses the local simulator by default. Set ${remoteSetting(true)} to use deployed repos, or ${remoteSetting(false)} to silence this warning.`
			);
		}
	};
}
