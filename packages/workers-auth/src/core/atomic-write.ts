import {
	clearFile as clearSharedFile,
	ProcessOwnerChecker,
	writeFileAtomically as writeSharedFileAtomically,
} from "@cloudflare/workers-utils/file-system";

/** Clear credentials and abandoned copies without removing file symlinks. */
export function clearFile(
	filePath: string,
	owners = new ProcessOwnerChecker()
): boolean {
	return clearSharedFile(filePath, { owners, temporaryPrefix: ".auth-" });
}

/** Replace credentials securely while retaining the legacy temporary-file namespace. */
export function writeFileAtomically(
	filePath: string,
	contents: string,
	owners = new ProcessOwnerChecker()
): void {
	writeSharedFileAtomically(filePath, contents, {
		owners,
		temporaryPrefix: ".auth-",
	});
}
