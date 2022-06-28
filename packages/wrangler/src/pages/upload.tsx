import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import {
	basename,
	dirname,
	extname,
	join,
	relative,
	resolve,
	sep,
} from "node:path";
import { hash as blake3hash } from "blake3-wasm";
import { render, Text } from "ink";
import Spinner from "ink-spinner";
import { getType } from "mime";
import PQueue from "p-queue";
import prettyBytes from "pretty-bytes";
import React from "react";
import { fetchResult } from "../cfetch";
import { FatalError } from "../errors";
import { logger } from "../logger";
import {
	BULK_UPLOAD_CONCURRENCY,
	MAX_BUCKET_FILE_COUNT,
	MAX_BUCKET_SIZE,
	MAX_UPLOAD_ATTEMPTS,
} from "./constants";
import { pagesBetaWarning } from "./utils";
import type { UploadPayloadFile } from "./types";
import type { ArgumentsCamelCase, Argv } from "yargs";

type UploadArgs = {
	directory: string;
	"output-manifest-path"?: string;
};

export function Options(yargs: Argv): Argv<UploadArgs> {
	return yargs
		.positional("directory", {
			type: "string",
			demandOption: true,
			description: "The directory of static files to upload",
		})
		.options({
			"output-manifest-path": {
				type: "string",
				description: "The name of the project you want to deploy to",
			},
		})
		.epilogue(pagesBetaWarning);
}

export const Handler = async ({
	directory,
	outputManifestPath,
}: ArgumentsCamelCase<UploadArgs>) => {
	if (!directory) {
		throw new FatalError("Must specify a directory.", 1);
	}

	if (!process.env.CF_PAGES_UPLOAD_JWT) {
		throw new FatalError("No JWT given.", 1);
	}

	const manifest = await upload({
		directory,
		jwt: process.env.CF_PAGES_UPLOAD_JWT,
	});

	if (outputManifestPath) {
		await mkdir(dirname(outputManifestPath), { recursive: true });
		await writeFile(outputManifestPath, JSON.stringify(manifest));
	}

	logger.log(`✨ Upload complete!`);
};

export const upload = async (
	args:
		| {
				directory: string;
				jwt: string;
		  }
		| { directory: string; accountId: string; projectName: string }
) => {
	async function fetchJwt(): Promise<string> {
		if ("jwt" in args) {
			return args.jwt;
		} else {
			return (
				await fetchResult<{ jwt: string }>(
					`/accounts/${args.accountId}/pages/projects/${args.projectName}/upload-token`
				)
			).jwt;
		}
	}

	type FileContainer = {
		content: string;
		contentType: string;
		sizeInBytes: number;
		hash: string;
	};

	const IGNORE_LIST = [
		"_worker.js",
		"_redirects",
		"_headers",
		".DS_Store",
		"node_modules",
		".git",
	];

	const directory = resolve(args.directory);

	const walk = async (
		dir: string,
		fileMap: Map<string, FileContainer> = new Map(),
		startingDir: string = dir
	) => {
		const files = await readdir(dir);

		await Promise.all(
			files.map(async (file) => {
				const filepath = join(dir, file);
				const filestat = await stat(filepath);

				if (IGNORE_LIST.includes(file)) {
					return;
				}

				if (filestat.isSymbolicLink()) {
					return;
				}

				if (filestat.isDirectory()) {
					fileMap = await walk(filepath, fileMap, startingDir);
				} else {
					const name = relative(startingDir, filepath).split(sep).join("/");

					// TODO: Move this to later so we don't hold as much in memory
					const fileContent = await readFile(filepath);

					const base64Content = fileContent.toString("base64");
					const extension = extname(basename(name)).substring(1);

					if (filestat.size > 25 * 1024 * 1024) {
						throw new FatalError(
							`Error: Pages only supports files up to ${prettyBytes(
								25 * 1024 * 1024
							)} in size\n${name} is ${prettyBytes(filestat.size)} in size`,
							1
						);
					}

					fileMap.set(name, {
						content: base64Content,
						contentType: getType(name) || "application/octet-stream",
						sizeInBytes: filestat.size,
						hash: blake3hash(base64Content + extension)
							.toString("hex")
							.slice(0, 32),
					});
				}
			})
		);

		return fileMap;
	};

	const fileMap = await walk(directory);

	if (fileMap.size > 20000) {
		throw new FatalError(
			`Error: Pages only supports up to 20,000 files in a deployment. Ensure you have specified your build output directory correctly.`,
			1
		);
	}

	const files = [...fileMap.values()];

	let jwt = await fetchJwt();

	const start = Date.now();

	const missingHashes = await fetchResult<string[]>(
		`/pages/assets/check-missing`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${jwt}`,
			},
			body: JSON.stringify({
				hashes: files.map(({ hash }) => hash),
			}),
		}
	);

	const sortedFiles = files
		.filter((file) => missingHashes.includes(file.hash))
		.sort((a, b) => b.sizeInBytes - a.sizeInBytes);

	// Start with a few buckets so small projects still get
	// the benefit of multiple upload streams
	const buckets: {
		files: FileContainer[];
		remainingSize: number;
	}[] = new Array(BULK_UPLOAD_CONCURRENCY).fill(null).map(() => ({
		files: [],
		remainingSize: MAX_BUCKET_SIZE,
	}));

	let bucketOffset = 0;
	for (const file of sortedFiles) {
		let inserted = false;

		for (let i = 0; i < buckets.length; i++) {
			// Start at a different bucket for each new file
			const bucket = buckets[(i + bucketOffset) % buckets.length];
			if (
				bucket.remainingSize >= file.sizeInBytes &&
				bucket.files.length < MAX_BUCKET_FILE_COUNT
			) {
				bucket.files.push(file);
				bucket.remainingSize -= file.sizeInBytes;
				inserted = true;
				break;
			}
		}

		if (!inserted) {
			buckets.push({
				files: [file],
				remainingSize: MAX_BUCKET_SIZE - file.sizeInBytes,
			});
		}
		bucketOffset++;
	}

	let counter = fileMap.size - sortedFiles.length;
	const { rerender, unmount } = render(
		<Progress done={counter} total={fileMap.size} />
	);

	const queue = new PQueue({ concurrency: BULK_UPLOAD_CONCURRENCY });

	for (const bucket of buckets) {
		// Don't upload empty buckets (can happen for tiny projects)
		if (bucket.files.length === 0) continue;

		const payload: UploadPayloadFile[] = bucket.files.map((file) => ({
			key: file.hash,
			value: file.content,
			metadata: {
				contentType: file.contentType,
			},
			base64: true,
		}));

		let attempts = 0;
		const doUpload = async (): Promise<void> => {
			try {
				return await fetchResult(`/pages/assets/upload`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${jwt}`,
					},
					body: JSON.stringify(payload),
				});
			} catch (e) {
				if (attempts < MAX_UPLOAD_ATTEMPTS) {
					// Linear backoff, 0 second first time, then 1 second etc.
					await new Promise((resolvePromise) =>
						setTimeout(resolvePromise, attempts++ * 1000)
					);

					if ((e as { code: number }).code === 8000013) {
						// Looks like the JWT expired, fetch another one
						jwt = await fetchJwt();
					}
					return doUpload();
				} else {
					throw e;
				}
			}
		};

		queue.add(() =>
			doUpload().then(
				() => {
					counter += bucket.files.length;
					rerender(<Progress done={counter} total={fileMap.size} />);
				},
				(error) => {
					return Promise.reject(
						new FatalError(
							"Failed to upload files. Please try again.",
							error.code || 1
						)
					);
				}
			)
		);
	}

	await queue.onIdle();

	unmount();

	const uploadMs = Date.now() - start;

	const skipped = fileMap.size - missingHashes.length;
	const skippedMessage = skipped > 0 ? `(${skipped} already uploaded) ` : "";

	logger.log(
		`✨ Success! Uploaded ${
			sortedFiles.length
		} files ${skippedMessage}${formatTime(uploadMs)}\n`
	);

	const doUpsertHashes = async (): Promise<void> => {
		try {
			return await fetchResult(`/pages/assets/upsert-hashes`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${jwt}`,
				},
				body: JSON.stringify({
					hashes: files.map(({ hash }) => hash),
				}),
			});
		} catch (e) {
			await new Promise((resolvePromise) => setTimeout(resolvePromise, 1000));

			if ((e as { code: number }).code === 8000013) {
				// Looks like the JWT expired, fetch another one
				jwt = await fetchJwt();
			}

			return await fetchResult(`/pages/assets/upsert-hashes`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${jwt}`,
				},
				body: JSON.stringify({
					hashes: files.map(({ hash }) => hash),
				}),
			});
		}
	};

	try {
		await doUpsertHashes();
	} catch {
		logger.warn(
			"Failed to update file hashes. Every upload appeared to succeed for this deployment, but you might need to re-upload for future deployments. This shouldn't have any impact other than slowing the upload speed of your next deployment."
		);
	}

	return Object.fromEntries(
		[...fileMap.entries()].map(([fileName, file]) => [
			`/${fileName}`,
			file.hash,
		])
	);
};

function formatTime(duration: number) {
	return `(${(duration / 1000).toFixed(2)} sec)`;
}

function Progress({ done, total }: { done: number; total: number }) {
	return (
		<>
			<Text>
				<Spinner type="earth" />
				{` Uploading... (${done}/${total})\n`}
			</Text>
		</>
	);
}
