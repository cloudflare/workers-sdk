type DurableObjectTarget =
	| { name: string; id?: never }
	| { id: string; name?: never };

export type DevControlDurableObjectEvictionOptions = DurableObjectTarget & {
	webSockets?: "close" | "hibernate";
};

export interface DevControl {
	evictDurableObject(
		scriptName: string,
		className: string,
		options: DevControlDurableObjectEvictionOptions
	): Promise<void>;
}

export function getDevControlDurableObjectBindingName(
	scriptName: string,
	className: string
) {
	return ["MINIFLARE_DEV_CONTROL_DO", scriptName, className].join(":");
}
