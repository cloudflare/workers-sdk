import { useMemo } from "react";
import StudioQueryResultStats from "./QueryResultStats";
import { StudioResultTable } from "./ResultTable";
import { createStudioTableStateFromResult } from "./Table/StateHelpers";
import type { StudioMultipleQueryResult } from "../../utils/studio";

interface StudioQueryResultTabProps {
	result: StudioMultipleQueryResult;
}

export function StudioQueryResultTab({ result }: StudioQueryResultTabProps) {
	const state = useMemo(() => {
		return createStudioTableStateFromResult({
			result: result.result,
		});
	}, [result]);

	const headerIndexList = useMemo(() => {
		if (!result.result.headers) {
			return [];
		}

		return Array.from({ length: result.result.headers.length }, (_, k) => k);
	}, [result.result.headers]);

	return (
		<div className="w-full h-full flex flex-col border-t border-border">
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
