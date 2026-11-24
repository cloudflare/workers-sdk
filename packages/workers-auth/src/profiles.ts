import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";
import { getCloudflareAuthProfileFromEnv } from "./env-vars";

const RESERVED_PROFILE_NAMES = ["default", "staging"];

export interface ProfileConfigOperations {
	exists(profile: string): boolean;
	list(): string[];
	delete(profile: string): void;
}

export interface DirectoryBindingsStorage {
	read(): Record<string, string>;
	write(bindings: Record<string, string>): void;
}

export interface DirectoryBindingOperations extends DirectoryBindingsStorage {
	activate(profile: string, dir: string): void;
	deactivate(dir: string): DeactivateDirectoryResult;
	getProfileForDirectory(startDir: string): string | undefined;
	getBindingsForProfile(profile: string): string[];
	removeAllBindingsForProfile(profile: string): string[];
}

/**
 * Storage for the user-level "global active profile": the profile a user has
 * switched to with `<cli> auth use <name>`. It applies everywhere a directory
 * binding, the `CLOUDFLARE_AUTH_PROFILE` environment variable, or an explicit
 * `--profile` flag does not.
 */
export interface GlobalProfileStorage {
	read(): string | undefined;
	write(profile: string | undefined): void;
}

export interface GlobalProfileOperations extends GlobalProfileStorage {
	/**
	 * Switch the global active profile. Passing `"default"` (or `undefined`)
	 * clears the override so the default profile is used again.
	 */
	use(profile: string | undefined): void;
	/**
	 * The global active profile, or `undefined` if none is set or the stored
	 * profile no longer exists.
	 */
	get(): string | undefined;
}

/** Where a resolved profile came from, in precedence order. */
export type ProfileResolutionSource =
	| "flag"
	| "env"
	| "directory"
	| "global"
	| "default";

export interface ProfileResolution {
	profile: string;
	source: ProfileResolutionSource;
	/** For `source === "directory"`: the directory the profile is bound to. */
	boundDirectory?: string;
}

export interface ProfileStore {
	configs: ProfileConfigOperations;
	bindings: DirectoryBindingOperations;
	global: GlobalProfileOperations;
	resolve(args: { profile?: string; cwd: string }): string;
	resolveWithSource(args: { profile?: string; cwd: string }): ProfileResolution;
}

export interface DeactivateDirectoryResult {
	removedProfile: string;
	newResolution: { profile: string | undefined; source: string };
}

export function createProfileStore(args: {
	configs: ProfileConfigOperations;
	bindings: DirectoryBindingsStorage;
	/**
	 * Storage for the global active profile. Optional for backwards
	 * compatibility: without it, there is no global switch and resolution
	 * falls straight through to the default profile.
	 */
	global?: GlobalProfileStorage;
}): ProfileStore {
	let inMemoryGlobalProfile: string | undefined;
	const globalStorage: GlobalProfileStorage = args.global ?? {
		read: () => inMemoryGlobalProfile,
		write: (profile) => {
			inMemoryGlobalProfile = profile;
		},
	};

	const global: GlobalProfileOperations = {
		read() {
			return globalStorage.read();
		},
		write(profile) {
			globalStorage.write(profile);
		},
		use(profile) {
			if (profile === undefined || profile === "default") {
				globalStorage.write(undefined);
				return;
			}
			validateProfileName(profile);
			globalStorage.write(profile);
		},
		get() {
			const stored = globalStorage.read();
			if (!stored || stored === "default") {
				return undefined;
			}
			// Ignore a stale or hand-edited value rather than failing every
			// command: the profile may have been deleted out from under us.
			if (!isValidProfileName(stored) || !args.configs.exists(stored)) {
				return undefined;
			}
			return stored;
		},
	};

	/**
	 * Resolve the profile for `cwd` ignoring the explicit flag and the
	 * environment: directory binding → global active profile → default.
	 */
	function resolveImplicit(cwd: string): ProfileResolution {
		const dirBinding = getProfileForDirectoryFromBindings(
			cwd,
			args.bindings.read()
		);
		if (dirBinding) {
			return {
				profile: dirBinding.profile,
				source: "directory",
				boundDirectory: dirBinding.dir,
			};
		}
		const globalProfile = global.get();
		if (globalProfile) {
			return { profile: globalProfile, source: "global" };
		}
		return { profile: "default", source: "default" };
	}

	const bindings: DirectoryBindingOperations = {
		read() {
			return args.bindings.read();
		},
		write(currentBindings) {
			args.bindings.write(currentBindings);
		},
		activate(profile, dir) {
			const normalizedDir = path.resolve(dir);
			const currentBindings = args.bindings.read();
			currentBindings[normalizedDir] = profile;
			args.bindings.write(currentBindings);
		},
		deactivate(dir) {
			const normalizedDir = path.resolve(dir);
			const currentBindings = args.bindings.read();

			const boundProfile = currentBindings[normalizedDir];
			if (boundProfile === undefined) {
				const parentBinding = getProfileForDirectoryFromBindings(
					normalizedDir,
					currentBindings
				);
				if (parentBinding) {
					throw new UserError(
						`No profile is directly bound to "${formatDirectoryForUserError(normalizedDir)}". The active profile "${parentBinding.profile}" is bound at "${formatDirectoryForUserError(
							parentBinding.dir
						)}". Run the deactivate command from that directory instead.`,
						{ telemetryMessage: "auth deactivate wrong directory" }
					);
				}
				throw new UserError(
					`No profile is bound to "${formatDirectoryForUserError(normalizedDir)}". Nothing to deactivate.`,
					{ telemetryMessage: "auth deactivate no binding" }
				);
			}

			delete currentBindings[normalizedDir];
			args.bindings.write(currentBindings);

			const fallbackProfile = getProfileForDirectoryFromBindings(
				normalizedDir,
				currentBindings
			);
			if (fallbackProfile) {
				return {
					removedProfile: boundProfile,
					newResolution: {
						profile: fallbackProfile.profile,
						source: `inherited from ${fallbackProfile.dir}`,
					},
				};
			}
			const globalProfile = global.get();
			if (globalProfile) {
				return {
					removedProfile: boundProfile,
					newResolution: {
						profile: globalProfile,
						source: "global active profile",
					},
				};
			}
			if (args.configs.exists("default")) {
				return {
					removedProfile: boundProfile,
					newResolution: { profile: "default", source: "default profile" },
				};
			}
			return {
				removedProfile: boundProfile,
				newResolution: { profile: undefined, source: "no profile" },
			};
		},
		getProfileForDirectory(startDir) {
			return getProfileForDirectoryFromBindings(startDir, args.bindings.read())
				?.profile;
		},
		getBindingsForProfile(profile) {
			return Object.entries(args.bindings.read())
				.filter(([, p]) => p === profile)
				.map(([dir]) => dir);
		},
		removeAllBindingsForProfile(profile) {
			const currentBindings = args.bindings.read();
			const removed: string[] = [];
			for (const [dir, p] of Object.entries(currentBindings)) {
				if (p === profile) {
					removed.push(dir);
					delete currentBindings[dir];
				}
			}
			if (removed.length > 0) {
				args.bindings.write(currentBindings);
			}
			return removed;
		},
	};

	function resolveWithSource(resolveArgs: {
		profile?: string;
		cwd: string;
	}): ProfileResolution {
		if (resolveArgs.profile) {
			if (resolveArgs.profile === "default") {
				return { profile: "default", source: "flag" };
			}
			validateProfileName(resolveArgs.profile);
			return { profile: resolveArgs.profile, source: "flag" };
		}

		const envProfile = getCloudflareAuthProfileFromEnv();
		if (envProfile) {
			if (envProfile === "default") {
				return { profile: "default", source: "env" };
			}
			validateProfileName(envProfile);
			return { profile: envProfile, source: "env" };
		}

		return resolveImplicit(resolveArgs.cwd);
	}

	return {
		configs: args.configs,
		bindings,
		global,
		resolve(resolveArgs) {
			return resolveWithSource(resolveArgs).profile;
		},
		resolveWithSource,
	};
}

function isValidProfileName(name: string): boolean {
	return (
		!RESERVED_PROFILE_NAMES.includes(name.toLowerCase()) &&
		/^[a-zA-Z0-9_-]+$/.test(name)
	);
}

export function validateProfileName(name: string): void {
	if (RESERVED_PROFILE_NAMES.includes(name.toLowerCase())) {
		throw new UserError(
			`"${name}" is a reserved profile name. Use the login and logout commands to manage the default profile, which applies as a global fallback.`,
			{ telemetryMessage: "auth profile reserved name" }
		);
	}

	if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
		throw new UserError(
			`Invalid profile name "${name}". Profile names may only contain alphanumeric characters, hyphens, and underscores.`,
			{ telemetryMessage: "auth profile invalid name" }
		);
	}
}

function formatDirectoryForUserError(dir: string): string {
	return path.relative(process.cwd(), dir) || ".";
}

/**
 * Finds the most-specific directory binding that covers `startDir` using
 * string prefix matching. Bindings are sorted by path length descending so
 * the longest (most-specific) match wins. The match must be at a path
 * boundary — the binding path must either equal `startDir` exactly or be
 * followed by a path separator.
 */
function getProfileForDirectoryFromBindings(
	startDir: string,
	bindings: Record<string, string>
): { profile: string; dir: string } | undefined {
	const normalizedDir = path.resolve(startDir);

	const sortedEntries = Object.entries(bindings).sort(
		([a], [b]) => b.length - a.length
	);

	for (const [boundDir, profile] of sortedEntries) {
		if (normalizedDir === boundDir) {
			return { profile, dir: boundDir };
		}
		if (
			normalizedDir.startsWith(boundDir) &&
			normalizedDir[boundDir.length] === path.sep
		) {
			return { profile, dir: boundDir };
		}
	}

	return undefined;
}
