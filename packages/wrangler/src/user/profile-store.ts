import {
	existsSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { createProfileStore } from "@cloudflare/workers-auth";
import { getGlobalConfigPath } from "@cloudflare/workers-utils";
import { defaultAuthConfigStorage } from "./auth-config-file";
import type {
	DirectoryBindingsStorage,
	ProfileConfigOperations,
	ProfileStore,
} from "@cloudflare/workers-auth";

const DIRECTORY_BINDINGS_FILE = "profiles/directory-bindings.json";
const PROFILE_CONFIG_EXTENSION = ".toml";

function getProfileConfigDirectory(): string {
	return path.dirname(defaultAuthConfigStorage("default").path());
}

function createWranglerProfileConfigOperations(): ProfileConfigOperations {
	return {
		exists(profile) {
			return existsSync(defaultAuthConfigStorage(profile).path());
		},
		list() {
			const profilesDir = getProfileConfigDirectory();
			if (!existsSync(profilesDir)) {
				return [];
			}

			return readdirSync(profilesDir)
				.filter((file) => file.endsWith(PROFILE_CONFIG_EXTENSION))
				.map((file) => file.slice(0, -PROFILE_CONFIG_EXTENSION.length));
		},
		delete(profile) {
			defaultAuthConfigStorage(profile).clear();
		},
	};
}

function getDirectoryBindingsPath(): string {
	return path.join(getGlobalConfigPath(), DIRECTORY_BINDINGS_FILE);
}

function createWranglerDirectoryBindingsStorage(): DirectoryBindingsStorage {
	return {
		read() {
			try {
				const raw = readFileSync(getDirectoryBindingsPath(), "utf-8");
				return JSON.parse(raw) as Record<string, string>;
			} catch {
				return {};
			}
		},
		write(bindings) {
			const bindingsPath = getDirectoryBindingsPath();
			mkdirSync(path.dirname(bindingsPath), { recursive: true });
			writeFileSync(
				bindingsPath,
				JSON.stringify(bindings, null, "\t"),
				"utf-8"
			);
		},
	};
}

export function createWranglerProfileStore(): ProfileStore {
	return createProfileStore({
		configs: createWranglerProfileConfigOperations(),
		bindings: createWranglerDirectoryBindingsStorage(),
	});
}
