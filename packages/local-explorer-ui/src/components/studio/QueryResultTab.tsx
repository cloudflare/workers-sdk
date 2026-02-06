import { Button } from "@cloudflare/kumo";
import { ExportIcon } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import { StudioExportModal } from "./ExportModal";
import StudioQueryResultStats from "./QueryResultStats";
import { StudioResultTable } from "./ResultTable";
import { createStudioTableStateFromResult } from "./Table/StateHelpers";
import type { StudioMultipleQueryResult } from "../../utils/studio";

interface StudioQueryResultTabProps {
	result: StudioMultipleQueryResult;
}

export function StudioQueryResultTab({ result }: StudioQueryResultTabProps) {
	const [isExportModalOpen, setIsExportModalOpen] = useState(false);

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

	const handleOpenExportModal = () => {
		setIsExportModalOpen(true);
	};

	return (
		<div className="w-full h-full flex flex-col border-t border-neutral-200 dark:border-neutral-800">
			{isExportModalOpen && (
				<StudioExportModal
					result={result}
					onClose={() => setIsExportModalOpen(false)}
				/>
			)}
			<div className="grow overflow-hidden">
				<StudioResultTable state={state} arrangeHeaderIndex={headerIndexList} />
			</div>
			<div className="shrink-0 h-11 flex items-center border-t border-neutral-200 dark:border-neutral-800">
				<div className="grow text-base px-4">
					<Button
						icon={ExportIcon}
						size="sm"
						variant="primary"
						onClick={handleOpenExportModal}
						aria-label="Export query results"
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
