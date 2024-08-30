/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import crypto from "crypto";
import path from "path";
import {
	CancellationToken,
	Disposable,
	ExtensionContext,
	QuickInput,
	QuickInputButton,
	QuickInputButtons,
	QuickPickItem,
	QuickPickItemKind,
	ThemeIcon,
	Uri,
	window,
	workspace,
} from "vscode";

const encoder = new TextEncoder();
const kvApiResponse = {
	result: [
		{
			id: "017365f38ab6405ea41492fbfb430563",
			title: "quicklink-worker-html",
			supports_url_encoding: true,
		},
		{
			id: "01962077d09242c5b0978a12bccaa5ed",
			title: "logs",
			supports_url_encoding: true,
		},
		{
			id: "02df5be2a39f48d68ddefd025b6aff5c",
			title: "MY_SECOND-d3080592-6268-4bcb-a4e8-027e02f15393",
			supports_url_encoding: true,
		},
		{
			id: "0346f704377f4aca8bed24f489a8ddb4",
			title: "MY_SECOND-f21124d0-c2f5-4feb-9ee7-0fcfe971afae",
			supports_url_encoding: true,
		},
		{
			id: "03c25b8cef234529972544ce60f0c56f",
			title: "SOME_NEW_KV_NAMESPACE3-aa66219f-8acc-4068-9785-86ea576e530c",
			supports_url_encoding: true,
		},
		{
			id: "0408d79206d54e859284b605fb19bff4",
			title: "wildebeest-penalosa-cache",
			supports_url_encoding: true,
		},
		{
			id: "059c2d670d6e49b8b32978ace0df869e",
			title: "manifest",
			supports_url_encoding: true,
		},
		{
			id: "065bba804e944768a90e5c88cdc7f406",
			title: "MY_KV_NAMESPACE-71f987ad-a890-49d2-9e18-90debb5ca6be",
			supports_url_encoding: true,
		},
		{
			id: "06e46ea96ab9494dae07a2f745f7adc1",
			title: "broadcast_info",
			supports_url_encoding: true,
		},
		{
			id: "09efc35d963e403e8bd813838e305978",
			title: "MY_KV_NAMESPACE2-f636017b-6055-4d4c-b646-24e881be7a50",
			supports_url_encoding: true,
		},
		{
			id: "0cad668ee48c48938e730942b7b280d2",
			title: "SOME_KV_BINDING-e32c862a-d628-4dd5-bcc6-d3ff2a2778fb",
			supports_url_encoding: true,
		},
		{
			id: "11b261c49761446dac77085232ceb76f",
			title: "playground-wfp-preview-TOKEN_LOOKUP",
			supports_url_encoding: true,
		},
		{
			id: "158cca1449f84a1c8adce9cf389621a2",
			title: "quicklink-worker-redirects",
			supports_url_encoding: true,
		},
		{
			id: "18fc60fe7cb74d6391e8e8bba4fa2b7e",
			title: "template-EXAMPLE_TODOS-9d495239-bc98-4ca0-a45a-7336be6258da",
			supports_url_encoding: true,
		},
		{
			id: "1cb0505406234378a06090cd5fd49354",
			title: "MY_KV_NAMESPACE",
			supports_url_encoding: true,
		},
		{
			id: "24d2846984dc4eb3831de7752682997b",
			title: "__test-301-workers_sites_assets",
			supports_url_encoding: true,
		},
		{
			id: "27401a5de9bb4a119a1f1445e396d6a6",
			title: "MY_KV-98ec60a5-7841-46fe-90c2-8ffa1704779f",
			supports_url_encoding: true,
		},
		{
			id: "27a719f73d4c40238b735c5170277d03",
			title: "Hell world",
			supports_url_encoding: true,
		},
		{
			id: "29ca6f5fc630477fa4b46d1bcd599db1",
			title: "__abuse-test-staging-workers_sites_assets",
			supports_url_encoding: true,
		},
		{
			id: "29f1e0838dde473ea421ec33568fe270",
			title: "todo-binding",
			supports_url_encoding: true,
		},
	],
	success: true,
	errors: [],
	messages: [],
	result_info: {
		page: 1,
		per_page: 20,
		count: 20,
		total_count: 100,
		total_pages: 5,
	},
};
class BindingType implements QuickPickItem {
	constructor(
		public label: string,
		public description?: string,
		public detail?: string,
		public iconPath?: Uri
	) {}
}
/**
 * A multi-step input using window.createQuickPick() and window.createInputBox().
 *
 * This first part uses the helper class `MultiStepInput` that wraps the API for the multi-step case.
 */
export async function multiStepInput(
	context: ExtensionContext,
	rootPath: string
) {
	class MyButton implements QuickInputButton {
		constructor(
			public iconPath: ThemeIcon,
			public tooltip: string
		) {}
	}

	const createResourceGroupButton = new MyButton(
		new ThemeIcon("search"),
		"Search existing namespaces"
	);

	const bindingTypes: BindingType[] = [
		new BindingType(
			"KV",
			"kv_namespaces",
			"Global, low-latency, key-value data storage",
			Uri.file(context.asAbsolutePath("resources/icons/kv.svg"))
		),
		new BindingType(
			"R2",
			"r2_buckets",
			"Object storage for all your data",
			Uri.file(context.asAbsolutePath("resources/icons/r2.svg"))
		),
		new BindingType(
			"D1",
			"d1_databases",
			"Serverless SQL databases",
			Uri.file(context.asAbsolutePath("resources/icons/d1.svg"))
		),
	];

	interface State {
		title: string;
		step: number;
		totalSteps: number;
		bindingType: BindingType;
		name: string;
		runtime: QuickPickItem;
		id: string;
	}

	async function collectInputs() {
		const state = {} as Partial<State>;
		await MultiStepInput.run((input) => pickResourceGroup(input, state));
		return state as State;
	}

	const title = "Add binding";

	async function pickResourceGroup(
		input: MultiStepInput,
		state: Partial<State>
	) {
		const pick = await input.showQuickPick({
			title,
			step: 1,
			totalSteps: 3,
			placeholder: "Choose a binding type",
			items: bindingTypes,
			activeItem:
				typeof state.bindingType !== "string" ? state.bindingType : undefined,
			// buttons: [createResourceGroupButton],
			shouldResume: shouldResume,
		});
		if (pick instanceof MyButton) {
			return (input: MultiStepInput) => selectFromExisting(input, state);
		}
		state.bindingType = pick as BindingType;
		return (input: MultiStepInput) => inputName(input, state);
	}

	async function selectFromExisting(
		input: MultiStepInput,
		state: Partial<State>
	) {
		let existing = await input.showQuickPick({
			title,
			step: 2,
			totalSteps: 4,
			items: kvApiResponse.result.map(
				(r) =>
					new BindingType(
						r.title,
						r.id,
						undefined,
						Uri.file(context.asAbsolutePath("resources/icons/kv.svg"))
					)
			),
			placeholder: "Choose an existing KV namespace",
			validate: validateNameIsUnique,
			shouldResume: shouldResume,
		});
		state.id = existing.description;
		return (input: MultiStepInput) => inputName(input, state);
	}

	async function inputName(input: MultiStepInput, state: Partial<State>) {
		const additionalSteps = typeof state.bindingType === "string" ? 1 : 0;
		// TODO: Remember current value when navigating back.
		let n = await input.showInputBox({
			title,
			step: 2 + additionalSteps,
			totalSteps: 3 + additionalSteps,
			value: state.name || "",
			prompt: "Choose a binding name (e.g. MY_BINDING)",
			validate: validateNameIsUnique,
			buttons: [createResourceGroupButton],
			shouldResume: shouldResume,
		});
		if (n instanceof MyButton) {
			return (input: MultiStepInput) => selectFromExisting(input, state);
		}
		state.name = n as string;
		return (input: MultiStepInput) => addToToml(input, state);
	}

	async function addToToml(input: MultiStepInput, state: Partial<State>) {
		await workspace
			.openTextDocument(Uri.file(path.join(rootPath!, "wrangler.toml")))
			.then((doc) => {
				window.showTextDocument(doc);
				let text = doc.getText();

				if (state.bindingType?.description === "r2_buckets") {
					text += `
					
[[r2_buckets]]
binding = "${state.name}"
bucket_name = "${crypto.randomUUID()}"`;
				} else if (state.bindingType?.description === "kv_namespaces") {
					text += `

[[kv_namespaces]]
binding = "${state.name}"${state.id ? `\nid = "${state.id}"` : ""}`;
				} else if (state.bindingType?.description === "d1_databases") {
					text += `
					
[[d1_databases]]
binding = "${state.name}"
database_id = "${crypto.randomUUID()}"`;
				}

				workspace.fs.writeFile(doc.uri, encoder.encode(text));
			});
	}

	function shouldResume() {
		// Could show a notification with the option to resume.
		return new Promise<boolean>((resolve, reject) => {
			// noop
		});
	}

	async function validateNameIsUnique(name: string) {
		// TODO: actually validate uniqueness
		return name === "SOME_KV_BINDING" ? "Name not unique" : undefined;
	}

	async function getAvailableRuntimes(
		resourceGroup: QuickPickItem | string,
		token?: CancellationToken
	): Promise<QuickPickItem[]> {
		// ...retrieve...
		await new Promise((resolve) => setTimeout(resolve, 1000));
		return ["Node 8.9", "Node 6.11", "Node 4.5"].map((label) => ({ label }));
	}

	const state = await collectInputs();
	window.showInformationMessage(`Creating Application Service '${state.name}'`);
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
	activeItem?: T;
	ignoreFocusOut?: boolean;
	placeholder: string;
	buttons?: QuickInputButton[];
	shouldResume: () => Thenable<boolean>;
}

interface InputBoxParameters {
	title: string;
	step: number;
	totalSteps: number;
	value: string;
	prompt: string;
	validate: (value: string) => Promise<string | undefined>;
	buttons?: QuickInputButton[];
	ignoreFocusOut?: boolean;
	placeholder?: string;
	shouldResume: () => Thenable<boolean>;
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
		activeItem,
		ignoreFocusOut,
		placeholder,
		buttons,
		shouldResume,
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
				if (activeItem) {
					input.activeItems = [activeItem];
				}
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
					input.onDidChangeSelection((items) => resolve(items[0])),
					input.onDidHide(() => {
						(async () => {
							reject(
								shouldResume && (await shouldResume())
									? InputFlowAction.resume
									: InputFlowAction.cancel
							);
						})().catch(reject);
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
		shouldResume,
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
				let validating = validate("");
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
						if (!(await validate(value))) {
							resolve(value);
						}
						input.enabled = true;
						input.busy = false;
					}),
					input.onDidChangeValue(async (text) => {
						const current = validate(text);
						validating = current;
						const validationMessage = await current;
						if (current === validating) {
							input.validationMessage = validationMessage;
						}
					}),
					input.onDidHide(() => {
						(async () => {
							reject(
								shouldResume && (await shouldResume())
									? InputFlowAction.resume
									: InputFlowAction.cancel
							);
						})().catch(reject);
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
