export type Workflow = {
	name: string;
	id: string;
	created_on: string;
	modified_on: string;
	script_name: string;
	class_name: string;
};

export type Version = {
	id: string;
	created_on: string;
	modified_on: string;
	workflow_id: string;
};
