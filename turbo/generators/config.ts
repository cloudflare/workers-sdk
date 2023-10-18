import type { PlopTypes } from "@turbo/gen";
import { execSync } from "node:child_process";

type Answers = {
	name: string;
	folder: "package" | "template";
};

const ThinkOfAName: PlopTypes.CustomActionFunction = async (answers) => {
	const typedAnswers = answers as Answers;

	console.dir(answers, { depth: Infinity });
	execSync(
		`cd ${typedAnswers.folder}/ && pnpm create cloudflare@latest ${typedAnswers.name} --no-deploy --no-git`,
		{
			stdio: "inherit",
		}
	);

	return "Finished C3 Setup & Installing Deps";
};

export default function generator(plop: PlopTypes.NodePlopAPI): void {
	plop.setGenerator("repo", {
		description: "Generator description",
		prompts: [
			{
				type: "input",
				name: "name",
				message: "What is your package/template name?",
			},
			{
				type: "list",
				name: "folder",
				choices: ["packages", "templates"],
			},
		],
		actions: [
			ThinkOfAName,
			{
				type: "add", // TODO: Make this into a `modify` action that adds to the existing file instead of overwriting it
				path: "{{folder}}/{{name}}/.eslintrc.js",
				templateFile: "templates/.eslintrc.js.hbs",
				force: true,
			},
			{
				type: "add", // TODO: Make this into a `modify` action that adds to the existing file instead of overwriting it
				path: "{{folder}}/{{name}}/tsconfig.json",
				templateFile: "templates/tsconfig.json.hbs",
				force: true,
			},
			{
				type: "add",
				path: "{{folder}}/{{name}}/turbo.json",
				templateFile: "templates/turbo.json.hbs",
				force: true,
			},
			/**
			 * The Package JSON should overwrite the "@cloudflare/eslint-config-worker","@cloudflare/workers-tsconfig", "wrangler" to all use `workspace:*`
			 */
			// {
			// 	type: "add", // TODO: Make this into a modify action that adds to the existing file instead of overwriting it
			// 	path: "{{folder}}/{{name}}/package.json",
			// 	templateFile: "templates/package.json.hbs",
			// }
		],
	});
}
