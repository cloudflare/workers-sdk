import { Readable } from "node:stream";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
	ComplianceConfig,
	Logger,
} from "@cloudflare/workers-utils";
import { initDeployHelpersContext } from "../../../shared/context";
import { syncAssets } from "../assets";
import type { DeployHelpersContext } from "../../../shared/types";

// A fake assets directory: buildAssetManifest reads it with mocked fs calls, so
// a manifest with far more entries than any real test fixture could afford can
// drive the bucket mapping cheaply.
const state = vi.hoisted(() => ({
	files: [] as string[],
	infoLogs: [] as unknown[][],
}));

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return {
		...actual,
		readdir: (async () => state.files) as unknown as typeof actual.readdir,
		stat: (async () => ({
			isSymbolicLink: () => false,
			isDirectory: () => false,
			size: 1,
		})) as unknown as typeof actual.stat,
		readFile: (async () => Buffer.from("x")) as unknown as typeof actual.readFile,
	};
});

vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		createReadStream: (() =>
			Readable.from(["x"])) as unknown as typeof actual.createReadStream,
	};
});

vi.mock("../hash", () => ({
	hashFile: (filepath: string) => {
		const name = filepath.split("/").pop() ?? "";
		// Two files sharing a hash, to pin down which entry the bucket mapping
		// resolves a duplicate hash to.
		if (name === "dup-a.txt" || name === "dup-b.txt") {
			return "duplicatehash".padEnd(32, "0");
		}
		const match = /file-(\d+)\.js$/.exec(name);
		return (match?.[1] ?? "0").padStart(32, "0");
	},
}));

const DUPLICATE_HASH = "duplicatehash".padEnd(32, "0");
// In bulk upload mode (the default), matched in isJwtExpired's vitest shortcut.
const INITIALIZE_JWT = "<<funfetti-auth-jwt>>";
const COMPLETION_JWT = "<<aus-completion-token>>";

const logger: Logger = {
	loggerLevel: "log",
	debug: () => {},
	log: () => {},
	info: (...args: unknown[]) => state.infoLogs.push(args),
	warn: () => {},
	error: () => {},
};

const fetchResult = async (
	complianceConfig: ComplianceConfig,
	resource: string,
	init?: RequestInit
) => {
	if (resource.includes("assets-upload-session")) {
		const manifest = JSON.parse(String(init?.body)).manifest as Record<
			string,
			{ hash: string }
		>;
		const hashes = Object.values(manifest).map((entry) => entry.hash);
		// When the manifest contains duplicate-hash files, request only their
		// shared hash, like an incremental upload session would.
		const requested = [
			...new Set(hashes.filter((hash) => hash === DUPLICATE_HASH)),
		];
		const toUpload = requested.length > 0 ? requested : hashes;
		const buckets: string[][] = [];
		const perBucket = Math.ceil(toUpload.length / 16);
		for (let i = 0; i < 16; i++) {
			buckets.push(toUpload.slice(i * perBucket, (i + 1) * perBucket));
		}
		return { buckets, jwt: INITIALIZE_JWT };
	}
	return { jwt: COMPLETION_JWT };
};

describe("syncAssets bucket mapping", () => {
	beforeEach(() => {
		state.infoLogs = [];
		initDeployHelpersContext({
			logger,
			fetchResult,
			fetchListResult: (async () => []) as never,
			fetchPagedListResult: (async () => []) as never,
			fetchKVGetValue: (async () => undefined) as never,
			confirm: (async () => true) as never,
			prompt: (async () => "") as never,
			select: (async () => "") as never,
		} as unknown as DeployHelpersContext);
	});

	test("scales independently of the asset manifest size", { timeout: 300_000 }, async () => {
		state.files = Array.from({ length: 120_000 }, (_, i) => `file-${i}.js`);

		const startedAt = performance.now();
		const result = await syncAssets(
			{} as ComplianceConfig,
			"account-id",
			"/fake/assets",
			"worker-name"
		);
		const seconds = (performance.now() - startedAt) / 1000;

		expect(result.jwt).toBe(COMPLETION_JWT);
		expect(result.assetUploadStats.assetUploadFileCount).toBe(120_000);
		// Mapping the requested hashes onto manifest entries must not rescan the
		// manifest once per hash; with 120k entries that adds minutes.
		// https://github.com/cloudflare/workers-sdk/issues/16713
		expect(
			seconds,
			`mapping 120k requested hashes onto a 120k entry manifest took ${seconds}s; expected an indexed lookup, not a scan per hash`
		).toBeLessThan(15);
	});

	test("resolves a duplicate hash to the first manifest entry with it", { timeout: 60_000 }, async () => {
		state.files = ["dup-a.txt", "dup-b.txt"];

		const result = await syncAssets(
			{} as ComplianceConfig,
			"account-id",
			"/fake/assets",
			"worker-name"
		);

		// Only one file was requested, and it must be the first entry the
		// manifest has for that hash, not the last.
		expect(result.assetUploadStats.assetUploadFileCount).toBe(1);
		const lines = state.infoLogs.flat().join("\n");
		expect(lines).toContain("+ /dup-a.txt");
		expect(lines).not.toContain("dup-b.txt");
	});
});
