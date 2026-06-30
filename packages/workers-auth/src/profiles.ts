import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";

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

export interface ProfileStore {
	configs: ProfileConfigOperations;
	bindings: DirectoryBindingOperations;
	resolve(args: { profile?: string; cwd: string }): string;
}

export interface DeactivateDirectoryResult {
	removedProfile: string;
	newResolution: { profile: string | undefined; source: string };
}

export function createProfileStore(args: {
	configs: ProfileConfigOperations;
	bindings: DirectoryBindingsStorage;
}): ProfileStore {
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
						)}". Run \`wrangler auth deactivate\` from that directory instead.`,
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

	return {
		configs: args.configs,
		bindings,
		resolve(resolveArgs) {
			if (resolveArgs.profile) {
				if (resolveArgs.profile === "default") {
					return "default";
				}
				validateProfileName(resolveArgs.profile);
				return resolveArgs.profile;
			}

			const dirProfile = bindings.getProfileForDirectory(resolveArgs.cwd);
			if (dirProfile) {
				return dirProfile;
			}

			return "default";
		},
	};
}

export function validateProfileName(name: string): void {
	if (RESERVED_PROFILE_NAMES.includes(name.toLowerCase())) {
		throw new UserError(
			`"${name}" is a reserved profile name. Use \`wrangler login\` and \`wrangler logout\` to manage the default profile, which applies as a global fallback.`,
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
