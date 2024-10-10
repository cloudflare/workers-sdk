import {
	changeStatusBaseHandler,
	changeStatusGenericOptions,
} from "./changeInstanceStatus";

export const instancesTerminateOptions = changeStatusGenericOptions;

export const instancesTerminateHandler = changeStatusBaseHandler("terminate");
