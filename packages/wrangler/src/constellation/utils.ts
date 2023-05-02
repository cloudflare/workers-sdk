import { fetchResult } from "../cfetch";
import { getEnvironmentVariableFactory } from "../environment-variables/factory";
import type { Config } from "../config";
import type { Project, Model, CatalogEntry } from "./types";

export const getConstellationWarningFromEnv = getEnvironmentVariableFactory({
	variableName: "NO_CONSTELLATION_WARNING",
});

export const constellationBetaWarning =
	getConstellationWarningFromEnv() !== undefined
		? ""
		: "--------------------\n🚧 Constellation AI is currently in open alpha and is not recommended for production data and traffic\n🚧 Please report any bugs to https://github.com/cloudflare/workers-sdk/issues/new/choose\n🚧 To give feedback, visit https://discord.gg/cloudflaredev\n--------------------\n";

export const getProjectByName = async (
	config: Config,
	accountId: string,
	name: string
): Promise<Project> => {
	const allProjects = await listProjects(accountId);
	const matchingProj = allProjects.find((proj) => proj.name === name);
	if (!matchingProj) {
		throw new Error(`Couldn't find Project with name '${name}'`);
	}
	return matchingProj;
};

export const getProjectModelByName = async (
	config: Config,
	accountId: string,
	proj: Project,
	modelName: string
): Promise<Model> => {
	const allModels = await listModels(accountId, proj);
	const matchingModel = allModels.find((model) => model.name === modelName);
	if (!matchingModel) {
		throw new Error(`Couldn't find Model with name '${modelName}'`);
	}
	return matchingModel;
};

export async function constellationList<ResponseType>(
	accountId: string,
	partialUrl: string
): Promise<Array<ResponseType>> {
	const pageSize = 50;
	let page = 1;
	const results = [];
	while (results.length % pageSize === 0) {
		const json: Array<ResponseType> = await fetchResult(
			`/accounts/${accountId}/constellation/${partialUrl}`,
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

export const listCatalogEntries = async (
	accountId: string
): Promise<Array<CatalogEntry>> => {
	return await constellationList(accountId, "catalog");
};

export const listModels = async (
	accountId: string,
	proj: Project
): Promise<Array<Model>> => {
	return constellationList(accountId, `project/${proj.id}/model`);
};

export const listProjects = async (
	accountId: string
): Promise<Array<Project>> => {
	return await constellationList(accountId, "project");
};

export const listRuntimes = async (
	accountId: string
): Promise<Array<string>> => {
	return await constellationList(accountId, "runtime");
};
