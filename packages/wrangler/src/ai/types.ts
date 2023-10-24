export type Task = {
	id: string;
	name: string;
	description: string;
};

export type Model = {
	id: string;
	source: number;
	task?: Task;
	tags: string[];
	name: string;
	description?: string;
};
