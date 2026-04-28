/**
 * Maps resource IDs to binding information for the local explorer.
 * This is passed to the explorer worker as a JSON binding.
 */
export type BindingIdMap = {
	d1: Record<string, string>; // databaseId -> bindingName
	kv: Record<string, string>; // namespaceId -> bindingName
	do: Record<string, DONamespaceInfo & { binding: string }>; // uniqueKey -> namespace info
	r2: Record<string, string>; // bucketName -> bindingName
	workflows: Record<string, WorkflowBindingInfo>; // workflowName -> binding info
};

type DONamespaceInfo = {
	className: string;
	scriptName: string;
	useSQLite: boolean;
};

export type WorkflowBindingInfo = {
	name: string; // workflow name
	className: string; // entrypoint class name
	scriptName: string; // script containing the workflow
	binding: string; // proxy binding name in env
	engineBinding: string; // Engine DO namespace binding for direct access
};

/**
 * Per-worker resource bindings for the local explorer.
 * Maps worker names to their resource bindings with IDs.
 */
export type WorkerResourceBindings = {
	kv: { id: string; bindingName: string }[];
	d1: { id: string; bindingName: string }[];
	r2: {
		/** id = bucket name */
		id: string;
		bindingName: string;
	}[];
	do: {
		/** id = `${scriptName}-${className}` */
		id: string;
		bindingName: string;
		className: string;
		scriptName: string;
		useSqlite: boolean;
	}[];
	workflows: {
		/** id = workflow name */
		id: string;
		bindingName: string;
		className: string;
		scriptName: string;
	}[];
};

export type ExplorerWorkerOpts = Record<string, WorkerResourceBindings>;
