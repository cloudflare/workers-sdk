import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { upload } from "@cloudflare/pages-shared/project/upload";
import { render, Text } from "ink";
import Spinner from "ink-spinner";
import React from "react";
import { fetchResult } from "../cfetch";
import { FatalError } from "../errors";
import isInteractive from "../is-interactive";
import { logger } from "../logger";

import { hashFile } from "./hash";
import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";
import type { UploadPayloadFile } from "@cloudflare/pages-shared/types";

type UploadArgs = StrictYargsOptionsToInterface<typeof Options>;

export function Options(yargs: CommonYargsArgv) {
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
			"skip-caching": {
				type: "boolean",
				description: "Skip asset caching which speeds up builds",
			},
		});
}

export const Handler = async ({
	directory,
	outputManifestPath,
	skipCaching,
}: UploadArgs) => {
	if (!directory) {
		throw new FatalError("Must specify a directory.", 1);
	}

	if (!process.env.CF_PAGES_UPLOAD_JWT) {
		throw new FatalError("No JWT given.", 1);
	}

	const manifest = await uploadWithDefaults({
		jwt: process.env.CF_PAGES_UPLOAD_JWT,
		directory,
		skipCaching,
	});

	if (outputManifestPath) {
		await mkdir(dirname(outputManifestPath), { recursive: true });
		await writeFile(outputManifestPath, JSON.stringify(manifest));
	}

	logger.log(`✨ Upload complete!`);
};

const checkMissing = (jwt: string, hashes: string[]) =>
	fetchResult<string[]>(`/pages/assets/check-missing`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${jwt}`,
		},
		body: JSON.stringify({
			hashes,
		}),
	});

const upsertHashes = (jwt: string, hashes: string[]) =>
	fetchResult(`/pages/assets/upsert-hashes`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${jwt}`,
		},
		body: JSON.stringify({
			hashes,
		}),
	});

const uploadPayload = (jwt: string, payload: UploadPayloadFile[]) =>
	fetchResult(`/pages/assets/upload`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${jwt}`,
		},
		body: JSON.stringify(payload),
	});

export const fetchJwt = async (accountId: string, projectName: string) => {
	const { jwt } = await fetchResult<{ jwt: string }>(
		`/accounts/${accountId}/pages/projects/${projectName}/upload-token`
	);

	return jwt;
};

interface UploadWithDefaultsBaseProps {
	directory: string;
	skipCaching?: boolean;
}

type UploadWithDefaultsProps =
	| (UploadWithDefaultsBaseProps & { jwt: string })
	| (UploadWithDefaultsBaseProps & { fetchJwt: () => Promise<string> });

export async function uploadWithDefaults({
	skipCaching = false,
	...props
}: UploadWithDefaultsProps) {
	// On the first progress event from the uploader, create the progress
	// renderer and populate these values f
	let rerender: (done: number, total: number) => void | undefined;
	let unmount: () => void | undefined;
	const onProgress = (done: number, total: number): void => {
		if (!rerender && !unmount) {
			const progress = renderProgress(done, total);
			rerender = progress.rerender;
			unmount = progress.unmount;
		} else {
			rerender(done, total);
		}
	};
	const onUploadComplete = () => {
		if (unmount) {
			unmount();
		}
	};

	return await upload({
		...props,
		logger,
		skipCaching: skipCaching ?? false,
		onProgress,
		onUploadComplete,
		checkMissing,
		upsertHashes,
		uploadPayload,
		hashFile,
	});
}

export function renderProgress(done: number, total: number) {
	if (isInteractive()) {
		const { rerender, unmount } = render(
			<Progress done={done} total={total} />
		);
		return {
			// eslint-disable-next-line no-shadow
			rerender(done: number, total: number) {
				rerender(<Progress done={done} total={total} />);
			},
			unmount,
		};
	} else {
		// eslint-disable-next-line no-shadow
		const rerender = (done: number, total: number) => {
			logger.log(`Uploading... (${done}/${total})`);
		};
		rerender(done, total);
		return { rerender, unmount() {} };
	}
}

function Progress({ done, total }: { done: number; total: number }) {
	return (
		<>
			<Text>
				{isInteractive() ? <Spinner type="earth" /> : null}
				{` Uploading... (${done}/${total})\n`}
			</Text>
		</>
	);
}
