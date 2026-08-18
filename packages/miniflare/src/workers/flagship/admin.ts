import type {
	EvaluationContext,
	EvaluationDetails,
	FlagValue,
} from "./evaluate";
import type { Flag, FlagInput } from "./flags";

export interface FlagshipAdmin {
	listFlags(): Promise<Flag[]>;
	getFlag(flagKey: string): Promise<Flag>;
	getAccountTag(): Promise<string | null>;
	setAccountTag(accountTag: string): Promise<void>;
	createFlag(input: FlagInput): Promise<Flag>;
	updateFlag(flagKey: string, input: FlagInput): Promise<Flag>;
	putFlag(input: FlagInput): Promise<Flag>;
	deleteFlag(flagKey: string): Promise<void>;
	evaluateFlag(
		flagKey: string,
		context?: EvaluationContext
	): Promise<EvaluationDetails<FlagValue>>;
}
