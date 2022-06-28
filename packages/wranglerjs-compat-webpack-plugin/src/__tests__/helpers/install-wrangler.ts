import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Octokit } from "@octokit/core";
import tar from "tar";
import {
	PATH_TO_WRANGLER,
	CACHE_DIR,
	GITHUB_ARTIFACT_WRANGLER_BINARY_NAME,
} from "./constants";

/**
 * Installs wrangler 1 to node_modules/.cache by downloading
 * artifacts from the latest github release
 */
export async function installWrangler1() {
	if (fs.existsSync(PATH_TO_WRANGLER)) {
		// we're already installed
		return;
	}

	// github API client
	const octokit = new Octokit();

	const {
		data: { assets },
	} = await octokit.request("GET /repos/{owner}/{repo}/releases/latest", {
		owner: "cloudflare",
		repo: "wrangler",
	});

	// rust targets (and wrangler 1 releases) are named with "target triples",
	// which follow the form <architecture>-<os>-<toolchain>.
	// M1 fans love ~nodejs~ wrangler2 for its multi-platform support
	let targetTriple:
		| "x86_64-pc-windows-msvc"
		| "x86_64-apple-darwin"
		| "x86_64-unknown-linux-musl";

	switch (os.platform()) {
		case "win32":
			targetTriple = "x86_64-pc-windows-msvc";
			break;
		case "darwin":
			targetTriple = "x86_64-apple-darwin";
			break;
		default:
			targetTriple = "x86_64-unknown-linux-musl";
			break;
	}

	const assetId = assets.find(({ name }) => name.includes(targetTriple))?.id;

	if (assetId === undefined) {
		throw new Error("Unable to get wrangler 1 release from github!");
	}

	// since we use Accept: "application/octet-stream" `data` is an ArrayBuffer
	const { data } = await octokit.request(
		"GET /repos/{owner}/{repo}/releases/assets/{asset_id}",
		{
			owner: "cloudflare",
			repo: "wrangler",
			asset_id: assetId,
			headers: {
				accept: "application/octet-stream",
			},
		}
	);
	const wranglerTarball = new Uint8Array(data as unknown as ArrayBuffer);

	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wrangler-install"));
	const tarballPath = path.join(tempDir, "wrangler.tar.gz");
	fs.writeFileSync(tarballPath, wranglerTarball);

	fs.mkdirSync(CACHE_DIR, { recursive: true });

	await tar.extract({
		strict: true,
		file: tarballPath,
		cwd: tempDir,
	});

	const wranglerBinaryPath = path.join(
		tempDir,
		"dist",
		GITHUB_ARTIFACT_WRANGLER_BINARY_NAME
	);
	fs.copyFileSync(wranglerBinaryPath, PATH_TO_WRANGLER);
	fs.chmodSync(PATH_TO_WRANGLER, "755");
}
