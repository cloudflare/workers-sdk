import type {
	EvaluationContext,
	EvaluationDetails,
	FlagValue,
} from "./evaluate";
import type { Flag, FlagChanges, FlagInput } from "./flags";

export interface FlagshipAdmin {
	listFlags(): Promise<Flag[]>;
	getFlag(flagKey: string): Promise<Flag>;
	getAccountTag(): Promise<string | null>;
	setAccountTag(accountTag: string): Promise<void>;
	createFlag(input: FlagInput): Promise<Flag>;
	updateFlag(flagKey: string, input: FlagInput): Promise<Flag>;
	patchFlag(flagKey: string, changes: FlagChanges): Promise<Flag>;
	putFlag(input: FlagInput): Promise<Flag>;
	putFlags(inputs: FlagInput[], accountTag: string): Promise<void>;
	deleteFlag(flagKey: string): Promise<void>;
	evaluateFlag(
		flagKey: string,
		context?: EvaluationContext
	): Promise<EvaluationDetails<FlagValue>>;
}
