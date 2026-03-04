import { Button } from "@cloudflare/kumo";
import { ExportIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { StudioExportModal } from "../Modal/Export";
import { StudioResultTable } from "../Table/Result";
import { createStudioTableStateFromResult } from "../Table/State/Helpers";
import { StudioQueryResultStats } from "./Stats";
import type { StudioMultipleQueryResult } from "../../../types/studio";
import type { StudioTableState } from "../Table/State";
import type { StudioResultHeaderMetadata } from "../Table/State/Helpers";

interface StudioQueryResultTabProps {
	result: StudioMultipleQueryResult;
}

export function StudioQueryResultTab({
	result,
}: StudioQueryResultTabProps): JSX.Element {
	const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

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
			<StudioExportModal
				closeModal={() => setIsExportModalOpen(false)}
				isOpen={isExportModalOpen}
				result={result}
			/>

			<div className="grow overflow-hidden">
				<StudioResultTable state={state} arrangeHeaderIndex={headerIndexList} />
			</div>

			<div className="shrink-0 h-11 flex items-center border-t border-border">
				<div className="grow text-base px-4">
					<Button
						aria-label="Export query results"
						icon={ExportIcon}
						onClick={(): void => setIsExportModalOpen(true)}
						size="sm"
						variant="primary"
					>
						Export
					</Button>
				</div>
				<div>
					<StudioQueryResultStats stats={result.result.stat} />
				</div>
			</div>
		</div>
	);
}
