import { useMemo } from "react";
import { createStudioTableStateFromResult } from "../Table/State/Helpers";
import { StudioQueryResultStats } from "./ResultStats";
import type { StudioMultipleQueryResult } from "../../../types/studio";
import type { StudioTableState } from "../Table/State";
import type { StudioResultHeaderMetadata } from "../Table/State/Helpers";

interface StudioQueryResultTabProps {
	result: StudioMultipleQueryResult;
}

export function StudioQueryResultTab({ result }: StudioQueryResultTabProps) {
	const _state = useMemo(
		(): StudioTableState<StudioResultHeaderMetadata> =>
			createStudioTableStateFromResult({
				result: result.result,
			}),
		[result]
	);

	const _headerIndexList = useMemo(() => {
		if (!result.result.headers) {
			return [];
		}

		return Array.from({ length: result.result.headers.length }, (_, k) => k);
	}, [result.result.headers]);

	return (
		<div className="w-full h-full flex flex-col border-t border-border">
			<div className="grow overflow-hidden">
				{/* TODO: Re-enable once implemented */}
				{/* <StudioResultTable state={state} arrangeHeaderIndex={headerIndexList} /> */}
			</div>
			<div className="shrink-0 h-11 flex items-center border-t border-border">
				<div>
					<StudioQueryResultStats stats={result.result.stat} />
				</div>
			</div>
		</div>
	);
}
