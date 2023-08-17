import commonModule from './middleware/common.module.template';
import loaderModule from './middleware/loader.module.template';

import jsonModule from './middleware/definitions/json.module.template';
import scheduledModule from './middleware/definitions/scheduled.module.template';

const encoder = new TextEncoder();

function inflateWorker(entrypoint: string, middleware: string[]): { entrypoint: string; additionalModules: FormData } {
	const prefix = `.internal-${crypto.randomUUID()}`;

	const namedMiddleware = middleware.map((m, i) => [`${prefix}-facade-${i}.js`, `__FACADE_${i}__`, m]);

	const imports = namedMiddleware.map(([path, name]) => /*javascript*/ `import ${name} from "${path}";`).join('\n');

	const names = namedMiddleware.map(([_path, name]) => name).join(',');

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

	const common = [`${prefix}-common.js`, commonModule as unknown as string];

	const loader = [
		`${prefix}-loader.js`,
		(loaderModule as unknown as string)
			.replace(/__IMPORT_SPECIFIER_COMMON__/g, common[0])
			.replace(/__IMPORT_SPECIFIER_ENTRY_POINT__/g, collection[0]),
	];

	const modules = [
		{
			name: loader[0],
			contents: encoder.encode(loader[1]),
			type: 'application/javascript+module',
		},
		{
			name: common[0],
			contents: encoder.encode(common[1]),
			type: 'application/javascript+module',
		},
		{
			name: collection[0],
			contents: encoder.encode(collection[1]),
			type: 'application/javascript+module',
		},
		...namedMiddleware.map(([path, _name, contents]) => ({
			name: path,
			contents: encoder.encode(contents),
			type: 'application/javascript+module',
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

export function constructMiddleware(entrypoint: string): { entrypoint: string; additionalModules: FormData } {
	const middleware = [scheduledModule, jsonModule];

	return inflateWorker(entrypoint, middleware);
}
