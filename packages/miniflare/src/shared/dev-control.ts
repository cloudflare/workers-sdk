export type DurableObjectIdentifier =
	| { name: string; id?: never }
	| { id: string; name?: never };

export type DurableObjectEvictionOptions = DurableObjectIdentifier & {
	webSockets?: "close" | "hibernate";
};

export interface DevControl {
	evictDurableObject(
		scriptName: string,
		className: string,
		options: DurableObjectEvictionOptions
	): Promise<void>;
}

export function getDevControlDurableObjectBindingName(
	scriptName: string,
	className: string
) {
	return ["MINIFLARE_DEV_CONTROL_DO", scriptName, className].join(":");
}
