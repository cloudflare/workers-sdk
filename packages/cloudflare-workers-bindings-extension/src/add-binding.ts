import assert from "node:assert";
import {
	Disposable,
	env,
	ExtensionContext,
	QuickInput,
	QuickInputButton,
	QuickInputButtons,
	QuickPickItem,
	Uri,
	window,
	workspace,
} from "vscode";
import {
	bindingKeys,
	Config,
	getConfigUri,
	getWranglerConfig,
} from "./show-bindings";
import { importWrangler } from "./wrangler";

type BindingLabel = "KV" | "R2" | "D1";
class BindingType implements QuickPickItem {
	constructor(
		public label: BindingLabel,
		public configKey?: string,
		public detail?: string,
		public iconPath?: Uri
	) {}
}

export async function addBindingFlow(context: ExtensionContext) {
	const bindingTypes: BindingType[] = [
		new BindingType(
			"KV",
			"kv_namespaces",
			"Global, low-latency, key-value data storage",
			Uri.file(context.asAbsolutePath("resources/icons/kv_namespaces.svg"))
		),
		new BindingType(
			"R2",
			"r2_buckets",
			"Object storage for all your data",
			Uri.file(context.asAbsolutePath("resources/icons/r2_buckets.svg"))
		),
		new BindingType(
			"D1",
			"d1_databases",
			"Serverless SQL databases",
			Uri.file(context.asAbsolutePath("resources/icons/d1_databases.svg"))
		),
	];

	interface State {
		config?: Config;
		configUri: Uri;
		bindingType?: BindingType;
		name?: string;
	}

	const title = "Add binding";

	async function collectInputs() {
		const configUri = await getConfigUri();
		if (!configUri) {
			const docs = await window.showErrorMessage(
				"Unable to locate Wrangler configuration file — please open or create a project with a wrangler.json(c) or wrangler.toml file. You can run `npx create cloudflare@latest` to get started with a template.",
				"Learn more"
			);
			if (docs) {
				env.openExternal(
					Uri.parse(
						"https://developers.cloudflare.com/workers/wrangler/configuration/"
					)
				);
			}
			return;
		}
		let config: Config | undefined;
		try {
			config = await getWranglerConfig();
		} catch {}
		if (!config) {
			window.showErrorMessage(
				"Please update wrangler to at least 3.99.0 to use this extension."
			);
			return;
		}

		const state = { config, configUri };
		await MultiStepInput.run((input) => pickBindingType(input, state));
		return state;
	}

	async function pickBindingType(input: MultiStepInput, state: State) {
		const pick = await input.showQuickPick({
			title,
			step: 1,
			totalSteps: 2,
			placeholder: "Choose a binding type",
			items: bindingTypes,
		});
		state.bindingType = pick as BindingType;
		return (input: MultiStepInput) => inputBindingName(input, state);
	}

	async function inputBindingName(input: MultiStepInput, state: State) {
		const allBindingNames = getAllBindingNames(state.config ?? {});

		let name = await input.showInputBox({
			title,
			step: 2,
			totalSteps: 2,
			value: state.name || "",
			prompt: "Choose a binding name",
			validate: validateNameIsUnique,
			// so that we only have to get all binding names once, rather than on each validation
			preExistingBindingNames: allBindingNames,
			placeholder: `e.g. MY_BINDING`,
			required: true,
		});
		state.name = name;
		return () => addToConfig(state);
	}

	async function addToConfig(state: State) {
		assert(state.bindingType?.configKey && state.name);
		const workspaceFolder = workspace.getWorkspaceFolder(state.configUri);

		if (!workspaceFolder) {
			return null;
		}

		const wrangler = importWrangler(workspaceFolder.uri.fsPath);

		const doc = await workspace.openTextDocument(state.configUri);
		window.showTextDocument(doc);
		let openDocs: string | undefined;
		let useClipboard = false;
		if (!wrangler) {
			useClipboard = true;
		} else {
			try {
				const configFileName = state.configUri.path.split("/").at(-1);
				wrangler.experimental_patchConfig(state.configUri.path, {
					[state.bindingType.configKey]: [{ binding: state.name }],
				});
				openDocs = await window.showInformationMessage(
					`🎉 The ${state.bindingType.label} binding '${state.name}' has been added to your ${configFileName}`,
					`Open ${state.bindingType.label} documentation`
				);
			} catch {
				useClipboard = true;
			}
		}
		if (useClipboard) {
			const patch = `[[${state.bindingType?.configKey!}]]
			binding = "${state.name}"
			`;
			env.clipboard.writeText(patch);
			openDocs = await window.showInformationMessage(
				`✨ A snippet has been copied to clipboard - please paste this into your wrangler.toml`,
				`Open ${state.bindingType.label} documentation`
			);
		}
		if (openDocs) {
			env.openExternal(Uri.parse(bindingDocs[state.bindingType.label]));
		}
	}

	async function validateNameIsUnique(name: string, allBindingNames: string[]) {
		return allBindingNames.includes(name) ? "Name not unique" : undefined;
	}

	await collectInputs();
}

// -------------------------------------------------------
// Helper code that wraps the API for the multi-step case.
// -------------------------------------------------------

class InputFlowAction {
	static back = new InputFlowAction();
	static cancel = new InputFlowAction();
	static resume = new InputFlowAction();
}

type InputStep = (input: MultiStepInput) => Thenable<InputStep | void>;

interface QuickPickParameters<T extends QuickPickItem> {
	title: string;
	step: number;
	totalSteps: number;
	items: T[];
	ignoreFocusOut?: boolean;
	placeholder: string;
	buttons?: QuickInputButton[];
}

interface InputBoxParameters {
	title: string;
	step: number;
	totalSteps: number;
	value: string;
	prompt: string;
	validate: (
		value: string,
		existingNames: string[]
	) => Promise<string | undefined>;
	buttons?: QuickInputButton[];
	ignoreFocusOut?: boolean;
	placeholder?: string;
	required?: boolean;
	preExistingBindingNames: string[];
}

export class MultiStepInput {
	static async run<T>(start: InputStep) {
		const input = new MultiStepInput();
		return input.stepThrough(start);
	}

	private current?: QuickInput;
	private steps: InputStep[] = [];

	private async stepThrough<T>(start: InputStep) {
		let step: InputStep | void = start;
		while (step) {
			this.steps.push(step);
			if (this.current) {
				this.current.enabled = false;
				this.current.busy = true;
			}
			try {
				step = await step(this);
			} catch (err) {
				if (err === InputFlowAction.back) {
					this.steps.pop();
					step = this.steps.pop();
				} else if (err === InputFlowAction.resume) {
					step = this.steps.pop();
				} else if (err === InputFlowAction.cancel) {
					step = undefined;
				} else {
					throw err;
				}
			}
		}
		if (this.current) {
			this.current.dispose();
		}
	}

	async showQuickPick<
		T extends QuickPickItem,
		P extends QuickPickParameters<T>,
	>({
		title,
		step,
		totalSteps,
		items,
		ignoreFocusOut,
		placeholder,
		buttons,
	}: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<
				T | (P extends { buttons: (infer I)[] } ? I : never)
			>((resolve, reject) => {
				const input = window.createQuickPick<T>();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.ignoreFocusOut = ignoreFocusOut ?? false;
				input.placeholder = placeholder;
				input.items = items;
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || []),
				];
				disposables.push(
					input.onDidTriggerButton((item) => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidChangeSelection((items) => resolve(items[0]))
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach((d) => d.dispose());
		}
	}

	async showInputBox<P extends InputBoxParameters>({
		title,
		step,
		totalSteps,
		value,
		prompt,
		validate,
		buttons,
		ignoreFocusOut,
		placeholder,
		required,
		preExistingBindingNames,
	}: P) {
		const disposables: Disposable[] = [];
		try {
			return await new Promise<
				string | (P extends { buttons: (infer I)[] } ? I : never)
			>((resolve, reject) => {
				const input = window.createInputBox();
				input.title = title;
				input.step = step;
				input.totalSteps = totalSteps;
				input.value = value || "";
				input.prompt = prompt;
				input.ignoreFocusOut = ignoreFocusOut ?? false;
				input.placeholder = placeholder;
				input.buttons = [
					...(this.steps.length > 1 ? [QuickInputButtons.Back] : []),
					...(buttons || []),
				];
				let validating = validate("", preExistingBindingNames);
				disposables.push(
					input.onDidTriggerButton((item) => {
						if (item === QuickInputButtons.Back) {
							reject(InputFlowAction.back);
						} else {
							resolve(<any>item);
						}
					}),
					input.onDidAccept(async () => {
						const value = input.value;
						input.enabled = false;
						input.busy = true;
						if (required && !value) {
							input.validationMessage = "You must provide a binding name";
						} else if (!(await validate(value, preExistingBindingNames))) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async (text) => {
						const current = validate(text, preExistingBindingNames);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage;
						}
					})
				);
				if (this.current) {
					this.current.dispose();
				}
				this.current = input;
				this.current.show();
			});
		} finally {
			disposables.forEach((d) => d.dispose());
		}
	}
}

const getAllBindingNames = (config: Config) => {
	return bindingKeys
		.map((key) => {
			const bindingsByType = config[key];
			return getBindingNames(bindingsByType);
		})
		.flat();
};
const getBindingNames = (value: unknown): string[] => {
	if (typeof value !== "object" || value === null) {
		return [];
	}
	if (isBindingList(value)) {
		return value.bindings.map(({ name }) => name);
	} else if (isNamespaceList(value)) {
		return value.map(({ binding }) => binding);
	} else if (isRecord(value)) {
		// browser and AI bindings are single values with a similar shape
		// { binding = "name" }
		if (value["binding"] !== undefined) {
			return [value["binding"] as string];
		}
		return Object.keys(value).filter((k) => value[k] !== undefined);
	} else {
		return [];
	}
};
const isBindingList = (
	value: unknown
): value is {
	bindings: {
		name: string;
	}[];
} =>
	isRecord(value) &&
	"bindings" in value &&
	Array.isArray(value.bindings) &&
	value.bindings.every(
		(binding) =>
			isRecord(binding) && "name" in binding && typeof binding.name === "string"
	);

const isNamespaceList = (value: unknown): value is { binding: string }[] =>
	Array.isArray(value) &&
	value.every(
		(entry) =>
			isRecord(entry) && "binding" in entry && typeof entry.binding === "string"
	);

const isRecord = (
	value: unknown
): value is Record<string | number | symbol, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const bindingDocs: Record<BindingLabel, string> = {
	KV: "https://developers.cloudflare.com/kv/get-started/#5-access-your-kv-namespace-from-your-worker",
	D1: "https://developers.cloudflare.com/d1/get-started/#write-queries-within-your-worker",
	R2: "https://developers.cloudflare.com/r2/api/workers/workers-api-usage/#4-access-your-r2-bucket-from-your-worker",
};
