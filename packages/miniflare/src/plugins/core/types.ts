/**
 * Maps resource IDs to binding information for the local explorer.
 * This is passed to the explorer worker as a JSON binding.
 */

export type BindingIdMap = {
	// TODO: add DB name here
	d1: Record<string, string>; // databaseId -> bindingName
	kv: Record<string, string>; // namespaceId -> bindingName
	do: Record<string, DONamespaceInfo & { binding: string }>; // uniqueKey -> namespace info
};

type DONamespaceInfo = {
	className: string;
	scriptName: string;
	useSQLite: boolean;
};
