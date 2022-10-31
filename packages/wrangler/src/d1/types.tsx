export type Database = {
	uuid: string;
	name: string;
	binding: string;
	internal_env?: string;
};

export type Backup = {
	id: string;
	database_id: string;
	created_at: string;
	state: "progress" | "done";
	num_tables: number;
	file_size: number;
	size?: string;
};
