import { cn } from "@cloudflare/kumo";
import { StudioTableHeaderResizer } from "./HeaderResizer";
import type { StudioTableHeaderProps } from "./BaseTable";
import type { StudioTableState } from "./State";
import type { ReactElement } from "react";

interface StudioTableHeaderListProps<HeaderMetadata> {
	headers: StudioTableHeaderProps<HeaderMetadata>[];
	onHeaderResize: (idx: number, newWidth: number) => void;
	renderHeader: (props: StudioTableHeaderProps<HeaderMetadata>) => ReactElement;
	state: StudioTableState<HeaderMetadata>;
	sticky: boolean;
}

export function StudioTableHeaderList<HeaderMetadata = unknown>({
	headers,
	onHeaderResize,
	renderHeader,
	state,
	sticky,
}: StudioTableHeaderListProps<HeaderMetadata>): JSX.Element {
	return (
		<thead className="contents">
			<tr className="contents">
				{headers.length > 0 && (
					<th className="sticky top-0 left-0 z-30 border-r border-b border-border bg-bg-secondary"></th>
				)}

				{headers.map((header, idx) => {
					return (
						<StudioTableHeader
							header={header}
							idx={idx}
							key={header.name}
							onHeaderResize={onHeaderResize}
							renderHeader={renderHeader}
							state={state}
							sticky={sticky && idx === 0}
						/>
					);
				})}
			</tr>
		</thead>
	);
}

function StudioTableHeader<HeaderMetadata = unknown>({
	header,
	idx,
	onContextMenu,
	onHeaderResize,
	renderHeader,
	state,
	sticky,
}: {
	header: StudioTableHeaderProps<HeaderMetadata>;
	idx: number;
	onContextMenu?: React.MouseEventHandler;
	onHeaderResize: (idx: number, newWidth: number) => void;
	renderHeader: (props: StudioTableHeaderProps<HeaderMetadata>) => ReactElement;
	state: StudioTableState<HeaderMetadata>;
	sticky: boolean;
}): JSX.Element {
	return (
		<th
			className={cn(
				{ "z-30": sticky },
				"sticky top-0 z-10 flex h-8.75 overflow-hidden border-r border-b border-border bg-background p-0 text-left leading-8.75"
			)}
			key={header.name}
			onContextMenu={onContextMenu}
			style={{ left: sticky ? state.gutterColumnWidth : undefined }}
			title={header.display.tooltip}
		>
			{renderHeader(header)}
			{header.setting.resizable && (
				<StudioTableHeaderResizer idx={idx + 1} onResize={onHeaderResize} />
			)}
		</th>
	);
}
