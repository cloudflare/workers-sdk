import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Establish the Secrets Store boundary before workerd can write plaintext blobs
 * or SQLite databases with its default permissions.
 *
 * @param persistPath - Plugin persistence directory, created if missing.
 * @returns Its path with parent symlinks resolved for the disk service.
 * @throws If the directory cannot be secured, is a symlink, or belongs to another user.
 */
export async function ensureSecretsStoreDirectory(
	persistPath: string
): Promise<string> {
	try {
		// Only restrict the plugin directory, not shared persistence parents. Resolve
		// configured parent aliases so the disk service uses the path we checked.
		await fs.mkdir(path.dirname(persistPath), { recursive: true });
		const parent = await fs.realpath(path.dirname(persistPath));
		const directoryPath = path.join(parent, path.basename(persistPath));
		try {
			await fs.mkdir(directoryPath, { mode: 0o700 });
		} catch (error) {
			if (
				!(error instanceof Error && "code" in error && error.code === "EEXIST")
			) {
				throw error;
			}
		}

		if (!(await fs.lstat(directoryPath)).isDirectory()) {
			throw new Error(
				"The Secrets Store directory must not be a symlink or file."
			);
		}
		// Windows permissions are governed by inherited ACLs. chmod() cannot
		// establish an owner-only boundary there, and opening directories is unsupported.
		if (process.platform === "win32") {
			return directoryPath.replaceAll("\\", "/");
		}

		// Check ownership and chmod the same inode. O_NOFOLLOW also rejects a
		// symlink substituted after lstat(), without changing its target's mode.
		const directory = await fs.open(
			directoryPath,
			constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW
		);
		try {
			const stats = await directory.stat();
			const uid = process.geteuid?.();
			if (uid === undefined || stats.uid !== uid) {
				throw new Error(
					"The Secrets Store directory must be owned by the current user."
				);
			}
			if ((stats.mode & 0o7777) !== 0o700) {
				await directory.chmod(0o700);
			}
			const secured = await directory.stat();
			const current = await fs.lstat(directoryPath);
			if (
				(secured.mode & 0o7777) !== 0o700 ||
				!current.isDirectory() ||
				current.dev !== secured.dev ||
				current.ino !== secured.ino
			) {
				throw new Error(
					"The Secrets Store directory could not be secured or was replaced."
				);
			}
		} finally {
			await directory.close();
		}
		return directoryPath;
	} catch (cause) {
		throw new Error(
			`Unable to secure Secrets Store persistence directory at ${persistPath}.`,
			{ cause }
		);
	}
}
