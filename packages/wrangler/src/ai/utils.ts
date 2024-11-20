import { fetchResult } from "../cfetch";
import type { Message } from "../parse";
import type { Finetune, Model } from "./types";

export function getErrorMessage(error: Message): string {
	return `${error.text || error.toString()}${
		error.notes
			? ` ${error.notes.map((note: Message) => note.text).join(", ")}`
			: ""
	}`;
}

function truncate(str: string, maxLen: number) {
	return str.slice(0, maxLen) + (str.length > maxLen ? "..." : "");
}

export function truncateDescription(
	description: string | undefined,
	alreadyUsed: number
): string {
	if (description === undefined || description === null) {
		return "";
	}

	if (process.stdout.columns === undefined) {
		return truncate(description, 100);
	}

	return truncate(description, process.stdout.columns - alreadyUsed);
}

async function aiCatalogList<ResponseType>(
	accountId: string,
	partialUrl: string
): Promise<Array<ResponseType>> {
	const pageSize = 50;
	let page = 1;
	const results = [];
	while (results.length % pageSize === 0) {
		const json: Array<ResponseType> = await fetchResult(
			`/accounts/${accountId}/ai/${partialUrl}`,
			{},
			new URLSearchParams({
				per_page: pageSize.toString(),
				page: page.toString(),
			})
		);
		page++;
		results.push(...json);
		if (json.length < pageSize) {
			break;
		}
	}
	return results;
}

async function aiFinetuneList<ResponseType>(
	accountId: string
): Promise<Array<ResponseType>> {
	const results: Array<ResponseType> = await fetchResult(
		`/accounts/${accountId}/ai/finetunes`,
		{},
		new URLSearchParams({})
	);
	return results;
}

export const listCatalogEntries = async (
	accountId: string
): Promise<Array<Model>> => {
	return await aiCatalogList(accountId, "models/search");
};

export const listFinetuneEntries = async (
	accountId: string
): Promise<Array<Finetune>> => {
	return await aiFinetuneList(accountId);
};
