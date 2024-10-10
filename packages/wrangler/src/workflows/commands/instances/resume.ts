import {
	changeStatusBaseHandler,
	changeStatusGenericOptions,
} from "./changeInstanceStatus";

export const instancesResumeOptions = changeStatusGenericOptions;

export const instancesResumeHandler = changeStatusBaseHandler("resume");
