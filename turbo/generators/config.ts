import type { PlopTypes } from "@turbo/gen";
import { exec, execSync, spawn } from "node:child_process";

const webFramework = [
	"angular",
	"astro",
	"docusaurus",
	"gatsby",
	"hono",
	"next",
	"nuxt",
	"qwik",
	"react",
	"remix",
	"solid",
	"svelte",
	"vue",
];

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
				type: "add",
				path: "packages/{{name}}/.eslintrc.js",
				templateFile: "templates/.eslintrc.js.hbs",
				force: true,
			},
			{
				type: "add",
				path: "packages/{{name}}/tsconfig.json",
				templateFile: "templates/tsconfig.json.hbs",
				force: true,
			},
		],
	});
}
