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
	typescript: boolean;
	worker: boolean;
	webframework: typeof webFramework;
};

const ThinkOfAName: PlopTypes.CustomActionFunction = async (answers) => {
	const typedAnswers = answers as Answers;

	execSync(
		`cd templates/ && pnpm create cloudflare@latest ${typedAnswers.name} --no-deploy --no-git`,
		{
			stdio: "inherit",
		}
	);

	return "Finished C3 Setup & Installing Deps";
};

const skipWebFramework = (answers: Record<string, any>) => {
	if (answers.worker === false) {
		console.log("Skipping Web Framework selection");
		return true;
	}
	return false;
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
			ThinkOfAName,
			{
				type: "add",
				path: "packages/{{name}}/.eslintrc.js",
				templateFile: "templates/.eslintrc.js.hbs",
			},
			{
				type: "add",
				path: "packages/{{name}}/tsconfig.json",
				templateFile: "templates/tsconfig.json.hbs",
			},
		],
	});

	plop.setGenerator("template", {
		description: "Generator description",
		prompts: [
			{
				type: "input",
				name: "name",
				message: "What is your template name?",
			},
		],
		actions: [
			ThinkOfAName,
			{
				type: "add",
				path: "templates/{{name}}/.eslintrc.js",
				templateFile: "templates/.eslintrc.js.hbs",
			},
			{
				type: "modify",
				path: "packages/{{name}}/tsconfig.json",
				// templateFile: "templates/tsconfig.json.hbs",
				transform(template, data, cfg) {
					console.log({ template, data, cfg });
					return template;
				},
			},
		],
	});
}
