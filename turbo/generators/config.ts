import type { PlopTypes } from "@turbo/gen";
import { spawnSync } from "node:child_process";

type Answers = {
	name: string;
	typescript: boolean;
	worker: boolean;
};

const ThinkOfAName: PlopTypes.CustomActionFunction = async (answers) => {
	const typedAnswers = answers as Answers;

	// if (typedAnswers.worker) {
	spawnSync(
		`cd templates/${typedAnswers.name} && pnpm create cloudflare@latest`
	);
	// }	else {
	// 		await execAsync()
	// 	}

	return "Finished install dependencies";
};

export default function generator(plop: PlopTypes.NodePlopAPI): void {
	plop.setGenerator("package", {
		description: "Generator description",
		prompts: [
			{
				type: "input",
				name: "name",
				message: "What is your package name?",
			},
		],
		actions: [
			{
				type: "add",
				path: "packages/{{name}}/src/",
			},
			// {
			// 	type: "add",
			// 	path: "packages/{{name}}/package.json",
			// 	templateFile: "templates/package.json.hbs",
			// },
			// {
			// 	type: "add",
			// 	path: "packages/{{name}}/.eslintrc.js",
			// 	templateFile: "templates/.eslintrc.js.hbs",
			// },
			// {
			// 	type: "add",
			// 	path: "packages/{{name}}/tsconfig.json",
			// 	templateFile: "templates/tsconfig.json.hbs",
			// },
			ThinkOfAName,
		],
	});

	plop.setGenerator("template", {
		description: "Generator description",
		prompts: [
			{
				type: "input",
				name: "name",
				message: "What is your package name?",
			},
			// {
			// 	type: "confirm",
			// 	name: "typescript",
			// 	message: "Is this template using typescript?",
			// },
			// {
			// 	type: "confirm",
			// 	name: "worker",
			// 	message: "Is this a worker template?",
			// },
		],
		actions: [
			// {
			// 	type: "add",
			// 	path: "templates/{{name}}/package.json",
			// 	templateFile: "templates/package.json.hbs",
			// },
			{
				type: "add",
				path: "templates/{{name}}/.eslintrc.js",
				templateFile: "templates/.eslintrc.js.hbs",
			},
			// {
			// 	type: "add",
			// 	skip: (answers: Record<string, any>) => {
			// 		if (answers.typescript === false) {
			// 			return "Skipping TypeScript setup";
			// 		}
			// 		return false;
			// 	},
			// 	path: "templates/{{name}}/tsconfig.json",
			// 	templateFile: "templates/tsconfig.json.hbs",
			// },
			async (...args) => await ThinkOfAName(...args),
		],
	});
}
