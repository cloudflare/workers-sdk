export type Project = {
	id: string;
	name: string;
	runtime: string;
};

export type Model = {
	id: string;
	project_id: string;
	name: string;
	description: string;
};

export type CatalogEntry = {
	project: Project;
	models: Model[];
};
