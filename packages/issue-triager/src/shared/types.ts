export type Issue = {
	title: string;
	number: number;
	url: string;
	body: string;
	updatedAt: string;
	labels: string[];
	assignees: string[];
	comments: {
		body: string;
		author: string;
		createdAt: string;
	}[];
	status: string;
};
