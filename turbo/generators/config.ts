import type { PlopTypes } from "@turbo/gen";

export default function generator(plop: PlopTypes.NodePlopAPI): void {
	plop.setGenerator("package", {
		description: "Generator description",
		prompts: [
			{
				type: "input",
				name: "name",
				message: "What is your package name?",
			},
			{
				type: "input",
				name: "version",
				message: "What is your package version?",
			},
		],
		actions: [
			{
				type: "add",
				path: "packages/{{name}}/package.json",
				templateFile: "templates/package.json.hbs",
			},
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
}
