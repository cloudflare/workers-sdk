import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Octokit } from "@octokit/core";
import tar from "tar";
import {
	PATH_TO_TRIANGLER,
	CACHE_DIR,
	GITHUB_ARTIFACT_TRIANGLER_BINARY_NAME,
} from "./constants";

/**
 * Installs Triangle v1 to node_modules/.cache by downloading
 * artifacts from the latest github release
 */
export async function installTriangle1() {
	if (fs.existsSync(PATH_TO_TRIANGLER)) {
		// we're already installed
		return;
	}

	// github API client
	const octokit = new Octokit();

	const {
		data: { assets },
	} = await octokit.request("GET /repos/{owner}/{repo}/releases/latest", {
		owner: "cloudflare",
		repo: "triangle",
	});

	// rust targets (and Triangle v1 releases) are named with "target triples",
	// which follow the form <architecture>-<os>-<toolchain>.
	// M1 fans love ~nodejs~ Triangle for its multi-platform support
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
		throw new Error("Unable to get Triangle v1 release from github!");
	}

	// since we use Accept: "application/octet-stream" `data` is an ArrayBuffer
	const { data } = await octokit.request(
		"GET /repos/{owner}/{repo}/releases/assets/{asset_id}",
		{
			owner: "cloudflare",
			repo: "triangle",
			asset_id: assetId,
			headers: {
				accept: "application/octet-stream",
			},
		}
	);
	const triangleTarball = new Uint8Array(data as unknown as ArrayBuffer);

	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "triangle-install"));
	const tarballPath = path.join(tempDir, "triangle.tar.gz");
	fs.writeFileSync(tarballPath, triangleTarball);

	fs.mkdirSync(CACHE_DIR, { recursive: true });

	await tar.extract({
		strict: true,
		file: tarballPath,
		cwd: tempDir,
	});

	const triangleBinaryPath = path.join(
		tempDir,
		"dist",
		GITHUB_ARTIFACT_TRIANGLER_BINARY_NAME
	);
	fs.copyFileSync(triangleBinaryPath, PATH_TO_TRIANGLER);
	fs.chmodSync(PATH_TO_TRIANGLER, "755");
}
