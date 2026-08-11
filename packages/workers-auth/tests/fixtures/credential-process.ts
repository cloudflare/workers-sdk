import assert from "node:assert";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { MockAgent, setGlobalDispatcher } from "undici";
import { EncryptedFileCredentialStore } from "../../src/credential-store/encrypted-file-store";
import { FileCredentialStore } from "../../src/credential-store/file-store";
import { createOAuthFlow } from "../../src/flow";
import { getRefreshLockPath, withRefreshLock } from "../../src/refresh-lock";

const [command, configPath, backend] = process.argv.slice(2);
assert(command && configPath);
const storage =
	backend === "encrypted"
		? new EncryptedFileCredentialStore(configPath, {
				getKey: () => new Uint8Array(32),
				setKey: () => {},
				deleteKey: () => {},
				describe: () => "subprocess test key",
			})
		: new FileCredentialStore(configPath);
const lockDir = getRefreshLockPath(storage.path());

const agent = new MockAgent();
agent.disableNetConnect();
agent.enableNetConnect(/^127\.0\.0\.1(?::\d+)?$/);
agent
	.get("https://dash.cloudflare.com")
	.intercept({ path: "/", method: "GET" })
	.reply(200, "")
	.persist();
setGlobalDispatcher(agent);

const flow = createOAuthFlow({
	logger: {
		debug() {},
		info() {},
		log() {},
		warn(...args) {
			process.send?.({ event: "warning", message: args.join(" ") });
		},
		error() {},
	},
	isNonInteractiveOrCI: () => true,
	openInBrowser: async () => {},
	hasEnvCredentials: () => false,
	clientId: "test-client-id",
	consent: {
		granted: { url: "https://example.com/granted" },
		denied: { url: "https://example.com/denied", error: "denied" },
	},
	cliDisplayName: "TestCLI",
	deviceLoginCommand: "test login --device",
	redirectUri: "http://localhost:9999/oauth/callback",
	storageFactory: () => storage,
	allowGlobalAuthKey: true,
	temporary: undefined,
});

async function run(): Promise<void> {
	process.send?.({ event: "started" });
	if (command === "hold") {
		await withRefreshLock(lockDir, async () => {
			process.send?.({ event: "locked" });
			await new Promise<void>((resolve) =>
				process.once("message", () => resolve())
			);
		});
	} else if (command === "refresh") {
		const refresh = flow.getOAuthTokenFromLocalState();
		process.send?.({ event: "pending" });
		assert(await refresh, "Refresh did not produce credentials");
	} else if (command === "logout") {
		const logout = flow.logout();
		process.send?.({ event: "pending" });
		await logout;
	} else if (command === "migrate") {
		storage.read();
	} else if (
		command === "crash-before-publish" ||
		command === "crash-before-write"
	) {
		const rename = fs.renameSync;
		fs.renameSync = (source, destination) => {
			if (
				destination ===
				(command === "crash-before-publish" ? lockDir : storage.path())
			) {
				process.exit(79);
			}
			return rename(source, destination);
		};
		syncBuiltinESMExports();
		if (command === "crash-before-publish") {
			await withRefreshLock(lockDir, async () => {
				throw new Error("must not run");
			});
		} else {
			storage.write({ refresh_token: "replacement" });
		}
	} else {
		throw new Error(`Unknown subprocess command: ${command}`);
	}
}

try {
	await run();
	process.send?.({ event: "done" });
} catch (error) {
	process.send?.({ event: "failed", message: String(error) });
	process.exitCode = 1;
} finally {
	await agent.close();
	process.disconnect?.();
}
