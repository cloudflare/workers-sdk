import commonModule from "./middleware/common.module.template";
import jsonModule from "./middleware/definitions/json.module.template";
import loaderModule from "./middleware/loader.module.template";

const encoder = new TextEncoder();

function addExplanatoryComment(source: string): string {
	return /*javascript*/ `// This is an internal file, which is part of the middleware system we use to display pretty error pages.\n${source}`;
}

function inflateWorker(
	entrypoint: string,
	middleware: string[]
): { entrypoint: string; additionalModules: FormData } {
	const prefix = `.internal-${crypto.randomUUID()}`;

	const namedMiddleware = middleware.map((m, i) => [
		`${prefix}-facade-${i}.js`,
		`__FACADE_${i}__`,
		m,
	]);

	const imports = namedMiddleware
		.map(([path, name]) => /*javascript*/ `import ${name} from "${path}";`)
		.join("\n");

	const names = namedMiddleware.map(([_path, name]) => name).join(",");

	const collection = [
		`${prefix}-collection.js`,
		/*javascript*/ `
		import worker from "${entrypoint}";
		${imports}
		const facade = {
			...worker,
			middleware: [
				${names}
			]
		}
		export * from "${entrypoint}";
		export default facade;
    `.trim(),
	];

	const common = [`${prefix}-common.js`, commonModule];

	const loader = [
		`${prefix}-loader.js`,
		loaderModule
			.replace(/\.\/common/g, common[0])
			.replace(/__ENTRY_POINT__/g, collection[0]),
	];

	const modules = [
		{
			name: loader[0],
			contents: encoder.encode(addExplanatoryComment(loader[1])),
			type: "application/javascript+module",
		},
		{
			name: common[0],
			contents: encoder.encode(addExplanatoryComment(common[1])),
			type: "application/javascript+module",
		},
		{
			name: collection[0],
			contents: encoder.encode(addExplanatoryComment(collection[1])),
			type: "application/javascript+module",
		},
		...namedMiddleware.map(([path, _name, contents]) => ({
			name: path,
			contents: encoder.encode(addExplanatoryComment(contents)),
			type: "application/javascript+module",
		})),
	];

	const formData = new FormData();

	for (const { name, contents, type } of modules) {
		formData.set(
			name,
			new Blob([contents], {
				type,
			}),
			name
		);
	}

	return {
		entrypoint: loader[0],
		additionalModules: formData,
	};
}

export function constructMiddleware(entrypoint: string): {
	entrypoint: string;
	additionalModules: FormData;
} {
	const middleware = [jsonModule];

	return inflateWorker(entrypoint, middleware);
}
