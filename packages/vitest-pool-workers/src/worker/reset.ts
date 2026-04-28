import workerdUnsafe from "workerd:unsafe";

export async function reset(): Promise<void> {
	await workerdUnsafe.deleteAllDurableObjects();
}

export async function abortAllDurableObjects(): Promise<void> {
	await workerdUnsafe.abortAllDurableObjects();
}
