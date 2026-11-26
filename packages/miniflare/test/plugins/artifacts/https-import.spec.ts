import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:https";
import path from "node:path";
import { promisify } from "node:util";
import { Miniflare, Response } from "miniflare";
import { test, vi } from "vitest";
import { gitEnvironment } from "../../../src/plugins/artifacts/git-client";
import { repositoryPath } from "../../../src/plugins/artifacts/storage";
import { singleModuleManifest, useTmp } from "../../test-shared";
import type {
	ArtifactsEventMessage,
	ArtifactsEventType,
} from "../../../src/workers/artifacts/events";
import type { Request } from "miniflare";

const exec = promisify(execFile);
type Delivery = ArtifactsEventMessage;
const WORKER = `
import { WorkflowEntrypoint } from "cloudflare:workers";
export class OnEvent extends WorkflowEntrypoint {
  async run(event, step) {
    await step.do("report", async () => {
      await this.env.REPORTER.fetch("http://reporter/workflow", {
        method: "POST", body: JSON.stringify(event.payload),
      });
      return "reported";
    });
  }
}
export default {
  async fetch(request, env) {
    const { method, name, args = [] } = await request.json();
    try {
      const target = name ? await env.REPOS.get(name) : env.REPOS;
      const result = await target[method](...args);
      if (result instanceof Blob) {
        return Response.json({ bytes: [...new Uint8Array(await result.arrayBuffer())] });
      }
      return Response.json(result);
    } catch (error) {
      return Response.json({ error: error.message, code: error.code }, { status: 400 });
    }
  }
};
`;

type ImportOptions = {
	source: { url: string; branch?: string; depth?: number };
	target: { name: string };
};

async function git(args: string[], cwd?: string): Promise<string> {
	const { stdout } = await exec("git", args, {
		cwd,
		env: {
			...gitEnvironment(),
			GIT_AUTHOR_NAME: "Fixture",
			GIT_AUTHOR_EMAIL: "fixture@example.test",
			GIT_COMMITTER_NAME: "Fixture",
			GIT_COMMITTER_EMAIL: "fixture@example.test",
		},
	});
	return stdout.trim();
}

async function makeSource(directory: string): Promise<{
	first: string;
	second: string;
	feature: string;
}> {
	const source = path.join(directory, "source");
	await git(["init", "--initial-branch=main", source]);
	await writeFile(path.join(source, "README"), "first\n");
	await git(["add", "README"], source);
	await git(["commit", "-m", "first"], source);
	const first = await git(["rev-parse", "HEAD"], source);
	await writeFile(path.join(source, "README"), "second\n");
	await git(["commit", "-am", "second"], source);
	const second = await git(["rev-parse", "HEAD"], source);
	await git(["checkout", "-b", "feature"], source);
	await writeFile(path.join(source, "feature.txt"), "feature\n");
	await git(["add", "feature.txt"], source);
	await git(["commit", "-m", "feature"], source);
	const feature = await git(["rev-parse", "HEAD"], source);
	const bare = path.join(directory, "source.git");
	await git(["clone", "--bare", source, bare]);
	await git(["symbolic-ref", "HEAD", "refs/heads/main"], bare);
	return { first, second, feature };
}

/** Serve native Git's smart HTTP CGI over a local, self-signed HTTPS origin. */
async function startHttpsGit(directory: string) {
	const keyPath = path.join(directory, "key.pem");
	const certPath = path.join(directory, "cert.pem");
	await exec("openssl", [
		"req",
		"-x509",
		"-newkey",
		"rsa:2048",
		"-nodes",
		"-days",
		"1",
		"-subj",
		"/CN=localhost",
		"-addext",
		"subjectAltName=DNS:localhost",
		"-keyout",
		keyPath,
		"-out",
		certPath,
	]);
	const server = createServer(
		{ key: await readFile(keyPath), cert: await readFile(certPath) },
		(request, response) => {
			const auth = `Basic ${Buffer.from("reader:correct-password").toString("base64")}`;
			if (request.headers.authorization !== auth) {
				response
					.writeHead(401, { "WWW-Authenticate": 'Basic realm="fixture"' })
					.end();
				return;
			}
			if (request.url?.startsWith("/redirected.git")) {
				redirectedRequests++;
				response.writeHead(500).end("Unexpected redirected request");
				return;
			}
			if (redirectTarget && request.url?.startsWith("/source.git/info/refs")) {
				response.writeHead(302, { Location: redirectTarget }).end();
				return;
			}
			if (stallInfoRefs && request.url?.startsWith("/source.git/info/refs")) {
				stalledRequests++;
				return;
			}
			if (
				interruptUpload &&
				request.url?.startsWith("/source.git/git-upload-pack")
			) {
				interrupted++;
				response.writeHead(200, {
					"Content-Type": "application/x-git-upload-pack-result",
				});
				response.write("0008NAK\n");
				response.destroy();
				return;
			}
			const url = new URL(request.url ?? "/", "https://localhost");
			const child = spawn("git", ["http-backend"], {
				env: {
					...gitEnvironment(),
					GIT_PROJECT_ROOT: directory,
					GIT_HTTP_EXPORT_ALL: "1",
					PATH_INFO: url.pathname,
					QUERY_STRING: url.search.slice(1),
					REQUEST_METHOD: request.method ?? "GET",
					CONTENT_TYPE: request.headers["content-type"] ?? "",
					CONTENT_LENGTH: request.headers["content-length"] ?? "",
					HTTP_GIT_PROTOCOL: String(request.headers["git-protocol"] ?? ""),
				},
				stdio: ["pipe", "pipe", "pipe"],
			});
			const output: Buffer[] = [];
			const errors: Buffer[] = [];
			request.pipe(child.stdin);
			child.stdout.on("data", (chunk: Buffer) => output.push(chunk));
			child.stderr.on("data", (chunk: Buffer) => errors.push(chunk));
			response.once("close", () => child.kill());
			child.once("error", () => response.destroy());
			child.once("close", (status) => {
				if (response.destroyed) {
					return;
				}
				const bytes = Buffer.concat(output);
				const separator = bytes.indexOf("\r\n\r\n") >= 0 ? "\r\n\r\n" : "\n\n";
				const end = bytes.indexOf(separator);
				if (end < 0) {
					response.writeHead(500).end(Buffer.concat(errors));
					return;
				}
				const headers = bytes.subarray(0, end).toString().split(/\r?\n/);
				const statusLine = headers.find((line) => line.startsWith("Status:"));
				const statusCode = statusLine
					? Number(statusLine.match(/^Status: (\d{3})/)?.[1])
					: 200;
				for (const line of headers) {
					const colon = line.indexOf(":");
					if (colon > 0 && !line.startsWith("Status:")) {
						response.setHeader(
							line.slice(0, colon),
							line.slice(colon + 1).trim()
						);
					}
				}
				response.writeHead(status === 0 ? statusCode : 500);
				response.end(bytes.subarray(end + separator.length));
			});
		}
	);
	let interruptUpload = false;
	let interrupted = 0;
	let stallInfoRefs = false;
	let stalledRequests = 0;
	let redirectTarget: string | undefined;
	let redirectedRequests = 0;
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", resolve);
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("HTTPS fixture did not bind a port");
	}
	return {
		certPath,
		url: `https://localhost:${address.port}/source.git`,
		get interrupted() {
			return interrupted;
		},
		get stalledRequests() {
			return stalledRequests;
		},
		set stallInfoRefs(value: boolean) {
			stallInfoRefs = value;
		},
		get redirectedRequests() {
			return redirectedRequests;
		},
		set redirectTarget(value: string | undefined) {
			redirectTarget = value;
		},
		set interruptUpload(value: boolean) {
			interruptUpload = value;
		},
		async close() {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
			});
		},
	};
}

async function call(
	mf: Miniflare,
	method: string,
	args: unknown[] = [],
	name?: string
): Promise<{ ok: boolean; body: unknown }> {
	const response = await mf.dispatchFetch("http://localhost", {
		method: "POST",
		body: JSON.stringify({ method, args, name }),
	});
	return { ok: response.ok, body: await response.json() };
}

function importOptions(
	url: string,
	name: string,
	branch?: string,
	depth?: number
): ImportOptions {
	return {
		source: { url, ...(branch ? { branch } : {}), ...(depth ? { depth } : {}) },
		target: { name },
	};
}

async function withFixture(
	callback: (context: {
		mf: Miniflare;
		fixture: Awaited<ReturnType<typeof startHttpsGit>>;
		commits: Awaited<ReturnType<typeof makeSource>>;
		directory: string;
	}) => Promise<void>,
	trust = true,
	events?: { repoEvent: ArtifactsEventType; delivered: Delivery[] }
) {
	const directory = await useTmp();
	const commits = await makeSource(directory);
	const fixture = await startHttpsGit(directory);
	const previousCA = process.env.GIT_SSL_CAINFO;
	// The controller's sidecar snapshots this environment at startup. Git gets
	// this CA only via GIT_SSL_CAINFO; neither Node nor workerd trust is changed.
	if (trust) {
		process.env.GIT_SSL_CAINFO = fixture.certPath;
	} else {
		delete process.env.GIT_SSL_CAINFO;
	}
	let mf: Miniflare | undefined;
	try {
		mf = new Miniflare({
			cf: false,
			resourcePersistencePath: path.join(directory, "persist"),
			workers: [
				{
					config: {
						name: "",
						compatibilityDate: "2026-09-03",
						env: {
							...(events && {
								REPORTER: {
									type: "fetcher" as const,
									handler: async (request: Request) => {
										events.delivered.push(
											(await request.json()) as ArtifactsEventMessage
										);
										return new Response();
									},
								},
							}),
							REPOS: {
								type: "artifacts",
								namespace: "https-import",
								dev: { remote: false },
							},
						},
						exports: events && {
							OnEvent: {
								type: "workflow",
								name: "on-event",
								events: (
									[events.repoEvent, "cf.artifacts.repo.token.created"] as const
								).map((type) => ({
									type,
									filter: {
										namespace: "https-import",
										...(type === "cf.artifacts.repo.token.created"
											? { repoName: "target" }
											: {}),
									},
								})),
							},
						},
						manifest: singleModuleManifest(WORKER),
					},
				},
			],
		});
		await mf.ready;
		restoreCA(previousCA);
		await callback({ mf, fixture, commits, directory });
	} finally {
		restoreCA(previousCA);
		try {
			await mf?.dispose();
		} finally {
			await fixture.close();
		}
	}
}

function restoreCA(value: string | undefined): void {
	if (value === undefined) {
		delete process.env.GIT_SSL_CAINFO;
	} else {
		process.env.GIT_SSL_CAINFO = value;
	}
}

test.for([
	{ operation: "create", repoEvent: "cf.artifacts.repo.created" },
	{ operation: "import", repoEvent: "cf.artifacts.repo.imported" },
	{ operation: "fork", repoEvent: "cf.artifacts.repo.forked" },
] as const)(
	"$operation publishes its initial token to Workflows only after success",
	async ({ operation, repoEvent }, { expect }) => {
		const delivered: Delivery[] = [];
		await withFixture(
			async ({ mf, fixture }) => {
				if (operation === "fork") {
					expect((await call(mf, "create", ["source"])).ok).toBe(true);
				}
				const args =
					operation === "import"
						? [
								importOptions(
									fixture.url.replace(
										"https://",
										"https://reader:correct-password@"
									),
									"target"
								),
							]
						: ["target"];
				const name = operation === "fork" ? "source" : undefined;
				const result = await call(mf, operation, args, name);
				expect(result.ok).toBe(true);
				const created = result.body as { token: string };
				const listed = (await call(mf, "listTokens", [], "target")).body as {
					total: number;
					tokens: { id: string; scope: string; expiresAt: string }[];
				};
				expect(listed.total).toBe(1);
				const [initialToken] = listed.tokens;
				await vi.waitFor(() => expect(delivered).toHaveLength(2), {
					timeout: 5_000,
				});
				const messages = delivered;
				expect(messages.map(({ type }) => type).sort()).toEqual(
					[repoEvent, "cf.artifacts.repo.token.created"].sort()
				);
				const token = messages.find(
					({ type }) => type === "cf.artifacts.repo.token.created"
				);
				const repo = messages.find(({ type }) => type === repoEvent);
				expect(token).toMatchObject({
					source: { namespace: "https-import", repoName: "target" },
					payload: {
						tokenId: initialToken.id,
						scope: initialToken.scope,
						expiresAt: initialToken.expiresAt,
					},
				});
				// Publication order is reflected by timestamps, not arrival order.
				assert(token && repo);
				expect(
					Date.parse(token.metadata.eventTimestamp)
				).toBeGreaterThanOrEqual(Date.parse(repo.metadata.eventTimestamp));
				expect(JSON.stringify(delivered)).not.toContain(created.token);
				// The plaintext returned by the operation identifies the published token.
				expect(
					(await call(mf, "revokeToken", [created.token], "target")).body
				).toBe(true);
				const afterRevoke = (await call(mf, "listTokens", [], "target"))
					.body as { tokens: { state: "active" | "revoked" | "expired" }[] };
				// Revocation must leave no active token, even if history is retained.
				expect(
					afterRevoke.tokens.filter(({ state }) => state === "active")
				).toEqual([]);
				// A duplicate target fails without creating a token or publishing either event.
				expect((await call(mf, operation, args, name)).ok).toBe(false);
				await new Promise((resolve) => setTimeout(resolve, 200));
				expect(delivered).toHaveLength(2);
			},
			true,
			{ repoEvent, delivered }
		);
	}
);

test("HTTPS import: credentials never follow a Git redirect", async ({
	expect,
}) => {
	await withFixture(async ({ mf, fixture }) => {
		fixture.redirectTarget = fixture.url.replace(
			"/source.git",
			"/redirected.git"
		);
		const url = fixture.url.replace(
			"https://",
			"https://reader:correct-password@"
		);
		const result = await call(mf, "import", [importOptions(url, "redirect")]);
		expect(result.ok).toBe(false);
		expect(fixture.redirectedRequests).toBe(0);
		expect((await call(mf, "list")).body).toMatchObject({ total: 0 });
	});
});

test("HTTPS import: full import exposes refs, file, log and Git clone through the public binding", async ({
	expect,
}) => {
	await withFixture(async ({ mf, fixture, commits, directory }) => {
		// Repository-local settings at the HTTPS source are not transferred by
		// a bare clone, even when the source itself uses native Git.
		await git(
			["config", "core.hooksPath", path.join(directory, "source-hooks")],
			path.join(directory, "source.git")
		);
		const url = fixture.url.replace(
			"https://",
			"https://reader:correct-password@"
		);
		const imported = await call(mf, "import", [importOptions(url, "full")]);
		expect(imported.ok, JSON.stringify(imported.body)).toBe(true);
		expect(imported.body).toMatchObject({
			name: "full",
			defaultBranch: "main",
		});
		const namespaceId = createHash("sha256")
			.update("https-import")
			.digest("hex")
			.slice(0, 32);
		const config = await readFile(
			path.join(
				repositoryPath(
					path.join(directory, "persist", "artifacts", namespaceId, "git"),
					"https-import",
					"full"
				),
				"config"
			),
			"utf8"
		);
		expect(config).not.toContain("correct-password");
		expect(config).not.toContain("source-hooks");
		expect(config).not.toContain('remote "origin"');
		expect(
			(await call(mf, "readFile", [{ ref: "main", path: "README" }], "full"))
				.body
		).toEqual({ bytes: [...Buffer.from("second\n")] });
		expect((await call(mf, "log", [], "full")).body).toMatchObject([
			{ hash: commits.second },
			{ hash: commits.first },
		]);
		expect(
			(
				await call(
					mf,
					"readFile",
					[{ ref: "feature", path: "feature.txt" }],
					"full"
				)
			).body
		).toEqual({ bytes: [...Buffer.from("feature\n")] });
		const info = (await call(mf, "info", [], "full")).body as {
			remote: string;
			source: string;
		};
		expect(info.source).toBe(`git:${fixture.url}`);
		expect(JSON.stringify(info)).not.toContain("correct-password");
		const token = (imported.body as { token: string }).token;
		await exec(
			"git",
			[
				"-c",
				`http.extraHeader=Authorization: Bearer ${token}`,
				"clone",
				info.remote,
				path.join(directory, "clone"),
			],
			{ env: gitEnvironment() }
		);
		expect(
			await readFile(path.join(directory, "clone", "README"), "utf8")
		).toBe("second\n");
	});
});

test("HTTPS import: depth and branch constrain the imported history and refs", async ({
	expect,
}) => {
	await withFixture(async ({ mf, fixture, commits }) => {
		const url = fixture.url.replace(
			"https://",
			"https://reader:correct-password@"
		);
		const result = await call(mf, "import", [
			importOptions(url, "shallow", "feature", 1),
		]);
		expect(result.ok, JSON.stringify(result.body)).toBe(true);
		expect(result.body).toMatchObject({ defaultBranch: "feature" });
		expect((await call(mf, "log", [], "shallow")).body).toMatchObject([
			{ hash: commits.feature },
		]);
		expect(
			(await call(mf, "readFile", [{ ref: "main", path: "README" }], "shallow"))
				.body
		).toBeNull();
	});
});

test("HTTPS import: disposal stops a Git clone stalled by the origin", async ({
	expect,
}) => {
	await withFixture(async ({ mf, fixture }) => {
		fixture.stallInfoRefs = true;
		const pending = call(mf, "import", [
			importOptions(
				fixture.url.replace("https://", "https://reader:correct-password@"),
				"stalled"
			),
		]).catch(() => undefined);
		for (
			let attempt = 0;
			attempt < 100 && fixture.stalledRequests === 0;
			attempt++
		) {
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		expect(fixture.stalledRequests).toBeGreaterThan(0);
		await expect(mf.dispose()).resolves.toBeUndefined();
		await pending;
	});
}, 15_000);

test("HTTPS import: Basic URL credentials, missing repos/branches, duplicate targets and retries", async ({
	expect,
}) => {
	await withFixture(async ({ mf, fixture }) => {
		const valid = fixture.url.replace(
			"https://",
			"https://reader:correct-password@"
		);
		const invalid = fixture.url.replace(
			"https://",
			"https://reader:wrong-password@"
		);
		for (const [url, name] of [
			[fixture.url, "no-auth"],
			[invalid, "wrong-auth"],
		]) {
			const failure = await call(mf, "import", [importOptions(url, name)]);
			expect(failure.ok).toBe(false);
			expect(failure.body).toMatchObject({ code: "REMOTE_AUTH_REQUIRED" });
			expect(JSON.stringify(failure.body)).not.toContain("wrong-password");
		}
		const missing = await call(mf, "import", [
			importOptions(valid.replace("source.git", "missing.git"), "absent"),
		]);
		expect(missing.ok).toBe(false);
		expect(missing.body).toMatchObject({ code: "NOT_FOUND" });
		const branch = await call(mf, "import", [
			importOptions(valid, "absent-branch", "nonexistent"),
		]);
		expect(branch.ok).toBe(false);
		expect(branch.body).toMatchObject({ code: "NOT_FOUND" });
		expect((await call(mf, "list")).body).toMatchObject({ total: 0 });
		expect(
			(await call(mf, "import", [importOptions(valid, "absent")])).ok
		).toBe(true);
		const duplicate = await call(mf, "import", [
			importOptions(valid, "ABSENT"),
		]);
		expect(duplicate.ok).toBe(false);
		expect(duplicate.body).toMatchObject({ code: "ALREADY_EXISTS" });
	});
});

test("HTTPS import: untrusted TLS fails closed without a CA", async ({
	expect,
}) => {
	await withFixture(async ({ mf, fixture }) => {
		const valid = fixture.url.replace(
			"https://",
			"https://reader:correct-password@"
		);
		const failed = await call(mf, "import", [
			importOptions(valid, "tls-failed"),
		]);
		expect(failed.ok).toBe(false);
		expect(failed.body).toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
		expect((await call(mf, "list")).body).toMatchObject({ total: 0 });
	}, false);
});

test("HTTPS import: interrupted upload cleans partial target and retry succeeds", async ({
	expect,
}) => {
	await withFixture(async ({ mf, fixture, directory }) => {
		const valid = fixture.url.replace(
			"https://",
			"https://reader:correct-password@"
		);
		fixture.interruptUpload = true;
		const failed = await call(mf, "import", [importOptions(valid, "retry")]);
		expect(failed.ok).toBe(false);
		expect(failed.body).toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
		expect(fixture.interrupted).toBeGreaterThan(0);
		expect((await call(mf, "list")).body).toMatchObject({ total: 0 });
		const [namespaceDirectory] = await readdir(
			path.join(directory, "persist", "artifacts")
		);
		expect(
			await readdir(
				path.join(directory, "persist", "artifacts", namespaceDirectory, "git")
			)
		).toEqual([]);
		fixture.interruptUpload = false;
		expect((await call(mf, "import", [importOptions(valid, "retry")])).ok).toBe(
			true
		);
		expect(
			(await call(mf, "readFile", [{ ref: "main", path: "README" }], "retry"))
				.body
		).toEqual({ bytes: [...Buffer.from("second\n")] });
	});
});

test("Git child only inherits explicit CA trust, never host TLS bypass or credentials", ({
	expect,
}) => {
	const env = gitEnvironment({
		PATH: "/usr/bin",
		GIT_SSL_CAINFO: "/tmp/explicit-ca.pem",
		GIT_SSL_NO_VERIFY: "true",
		GIT_ASKPASS: "/tmp/askpass",
		GIT_CONFIG_PARAMETERS: "'http.extraHeader=Authorization: secret'",
	});
	expect(env.GIT_SSL_CAINFO).toBe("/tmp/explicit-ca.pem");
	expect(env.GIT_SSL_NO_VERIFY).toBeUndefined();
	expect(env.GIT_ASKPASS).toBeUndefined();
	expect(env.GIT_CONFIG_PARAMETERS).toBeUndefined();
});
