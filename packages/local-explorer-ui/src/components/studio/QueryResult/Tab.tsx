import { useMemo } from "react";
import { StudioResultTable } from "../Table/Result";
import { createStudioTableStateFromResult } from "../Table/State/Helpers";
import { StudioQueryResultStats } from "./Stats";
import type { StudioMultipleQueryResult } from "../../../types/studio";
import type { StudioTableState } from "../Table/State";
import type { StudioResultHeaderMetadata } from "../Table/State/Helpers";

interface StudioQueryResultTabProps {
	result: StudioMultipleQueryResult;
}

export function StudioQueryResultTab({ result }: StudioQueryResultTabProps) {
	const state = useMemo(
		(): StudioTableState<StudioResultHeaderMetadata> =>
			createStudioTableStateFromResult({
				result: result.result,
			}),
		[result]
	);

	const headerIndexList = useMemo((): number[] => {
		if (!result.result.headers) {
			return [];
		}

		return Array.from({ length: result.result.headers.length }, (_, k) => k);
	}, [result.result.headers]);

	return (
		<div className="w-full h-full flex flex-col">
			<div className="grow overflow-hidden">
				<StudioResultTable state={state} arrangeHeaderIndex={headerIndexList} />
			</div>
			<div className="shrink-0 h-11 flex items-center border-t border-border">
				<div>
					<StudioQueryResultStats stats={result.result.stat} />
				</div>
			</div>
		</div>
	);
}
