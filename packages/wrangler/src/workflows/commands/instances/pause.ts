import {
	changeStatusBaseHandler,
	changeStatusGenericOptions,
} from "./changeInstanceStatus";

export const instancesPauseOptions = changeStatusGenericOptions;

export const instancesPauseHandler = changeStatusBaseHandler("pause");
