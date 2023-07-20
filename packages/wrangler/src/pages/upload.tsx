import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { render, Text } from "ink";
import Spinner from "ink-spinner";
import React from "react";
import { uploadDeploymentFiles } from "../api/pages/uploadDeploymentFiles";
import { FatalError } from "../errors";
import isInteractive from "../is-interactive";
import { logger } from "../logger";

import type {
	CommonYargsArgv,
	StrictYargsOptionsToInterface,
} from "../yargs-types";

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

	// On the first progress event from the uploader, create the progress
	// renderer and populate these values f
	let rerender: (done: number, total: number) => void | undefined;
	let unmount: () => void | undefined;

	const manifest = await uploadDeploymentFiles({
		directory,
		jwt: process.env.CF_PAGES_UPLOAD_JWT,
		skipCaching: skipCaching ?? false,
		onProgress: (done, total) => {
			if (!rerender && !unmount) {
				const progress = renderProgress(done, total);
				rerender = progress.rerender;
				unmount = progress.unmount;
			} else {
				rerender(done, total);
			}
		},
		onUploadComplete: () => {
			if (unmount) {
				unmount();
			}
		},
	});

	if (outputManifestPath) {
		await mkdir(dirname(outputManifestPath), { recursive: true });
		await writeFile(outputManifestPath, JSON.stringify(manifest));
	}

	logger.log(`✨ Upload complete!`);
};

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
