export type TestCase = {
	title: string;
	files: string[];
	requestPath: string;
	matchedFile?: string;
	finalPath?: string;
};
