import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { UserError } from "@cloudflare/workers-utils";

const RESERVED_PROFILE_NAMES = ["default", "staging"];

const DIRECTORY_BINDINGS_FILE = "profiles/directory-bindings.json";
const PROFILES_CONFIG_PATH = "config";

function getProfileFilePath(configDir: string, profile: string): string {
	return path.join(configDir, PROFILES_CONFIG_PATH, `${profile}.toml`);
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

export function profileExists(configDir: string, profile: string): boolean {
	return existsSync(getProfileFilePath(configDir, profile));
}

export function listProfiles(configDir: string): string[] {
	const profilesDir = path.join(configDir, PROFILES_CONFIG_PATH);
	if (!existsSync(profilesDir)) {
		return [];
	}

	return readdirSync(profilesDir)
		.filter((f) => f.endsWith(".toml"))
		.map((f) => f.replace(/\.toml$/, ""));
}

export function deleteProfileFile(configDir: string, profile: string): void {
	const filePath = getProfileFilePath(configDir, profile);
	if (existsSync(filePath)) {
		rmSync(filePath);
	}
}

function getDirectoryBindingsPath(configDir: string): string {
	return path.join(configDir, DIRECTORY_BINDINGS_FILE);
}

export function readDirectoryBindings(
	configDir: string
): Record<string, string> {
	try {
		const raw = readFileSync(getDirectoryBindingsPath(configDir), "utf-8");
		return JSON.parse(raw) as Record<string, string>;
	} catch {
		return {};
	}
}

export function writeDirectoryBindings(
	configDir: string,
	bindings: Record<string, string>
): void {
	const bindingsPath = getDirectoryBindingsPath(configDir);
	mkdirSync(path.dirname(bindingsPath), { recursive: true });
	writeFileSync(bindingsPath, JSON.stringify(bindings, null, "\t"), "utf-8");
}

export function activateProfileForDirectory(
	configDir: string,
	profile: string,
	dir: string
): void {
	const normalizedDir = path.resolve(dir);
	const bindings = readDirectoryBindings(configDir);
	bindings[normalizedDir] = profile;
	writeDirectoryBindings(configDir, bindings);
}

export function deactivateDirectory(
	configDir: string,
	dir: string
): {
	removedProfile: string;
	newResolution: { profile: string | undefined; source: string };
} {
	const normalizedDir = path.resolve(dir);
	const bindings = readDirectoryBindings(configDir);

	const boundProfile = bindings[normalizedDir];
	if (boundProfile === undefined) {
		const parentBinding = getProfileForDirectoryFromBindings(
			normalizedDir,
			bindings
		);
		if (parentBinding) {
			throw new UserError(
				`No profile is directly bound to "${normalizedDir}". The active profile "${parentBinding.profile}" is bound at "${parentBinding.dir}". Run \`wrangler auth deactivate\` from that directory instead.`,
				{ telemetryMessage: "auth deactivate wrong directory" }
			);
		}
		throw new UserError(
			`No profile is bound to "${normalizedDir}". Nothing to deactivate.`,
			{ telemetryMessage: "auth deactivate no binding" }
		);
	}

	delete bindings[normalizedDir];
	writeDirectoryBindings(configDir, bindings);

	const fallbackProfile = getProfileForDirectoryFromBindings(
		normalizedDir,
		bindings
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
	if (profileExists(configDir, "default")) {
		return {
			removedProfile: boundProfile,
			newResolution: { profile: "default", source: "default profile" },
		};
	}
	return {
		removedProfile: boundProfile,
		newResolution: { profile: undefined, source: "no profile" },
	};
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

export function getProfileForDirectory(
	configDir: string,
	startDir: string
): string | undefined {
	const bindings = readDirectoryBindings(configDir);
	return getProfileForDirectoryFromBindings(startDir, bindings)?.profile;
}

export function getBindingsForProfile(
	configDir: string,
	profile: string
): string[] {
	const bindings = readDirectoryBindings(configDir);
	return Object.entries(bindings)
		.filter(([, p]) => p === profile)
		.map(([dir]) => dir);
}

export function removeAllBindingsForProfile(
	configDir: string,
	profile: string
): string[] {
	const bindings = readDirectoryBindings(configDir);
	const removed: string[] = [];
	for (const [dir, p] of Object.entries(bindings)) {
		if (p === profile) {
			removed.push(dir);
			delete bindings[dir];
		}
	}
	if (removed.length > 0) {
		writeDirectoryBindings(configDir, bindings);
	}
	return removed;
}

/**
 * Resolves which profile to use.
 *
 * Priority:
 * 1. Explicit `--profile` flag
 * 2. Directory binding prefix match from `cwd`
 * 3. `"default"`
 */
export function resolveProfile(args: {
	configDir: string;
	profile?: string;
	cwd: string;
}): string {
	if (args.profile) {
		validateProfileName(args.profile);
		return args.profile;
	}

	const dirProfile = getProfileForDirectory(args.configDir, args.cwd);
	if (dirProfile) {
		return dirProfile;
	}

	return "default";
}
