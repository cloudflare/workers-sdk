export type Finetune = {
	id: string;
	name: string;
	description: string;
	account_id?: number;
	created_at?: string;
	modified_at?: string;
};

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
