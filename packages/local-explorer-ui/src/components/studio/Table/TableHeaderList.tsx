import { cn } from "@cloudflare/kumo";
import { StudioTableHeaderResizer } from "./TableHeaderResizer";
import type { StudioTableHeaderProps } from "./BaseTable";
import type { StudioTableState } from "./TableState";
import type { ReactElement } from "react";

export function StudioTableHeaderList<HeaderMetadata = unknown>({
	headers,
	onHeaderResize,
	renderHeader,
	sticky,
	state,
}: {
	headers: StudioTableHeaderProps<HeaderMetadata>[];
	renderHeader: (props: StudioTableHeaderProps<HeaderMetadata>) => ReactElement;
	onHeaderResize: (idx: number, newWidth: number) => void;
	sticky: boolean;
	state: StudioTableState<HeaderMetadata>;
}) {
	return (
		<thead className="contents">
			<tr className="contents">
				{headers.length > 0 && (
					<th className="sticky top-0 left-0 z-30 border-r border-b bg-bg-secondary border-border"></th>
				)}

				{headers.map((header, idx) => {
					return (
						<StudioTableHeader
							key={header.name}
							sticky={sticky && idx === 0}
							header={header}
							renderHeader={renderHeader}
							idx={idx}
							onHeaderResize={onHeaderResize}
							state={state}
						/>
					);
				})}
			</tr>
		</thead>
	);
}

function StudioTableHeader<HeaderMetadata = unknown>({
	idx,
	header,
	onHeaderResize,
	onContextMenu,
	sticky,
	renderHeader,
	state,
}: {
	idx: number;
	sticky: boolean;
	header: StudioTableHeaderProps<HeaderMetadata>;
	state: StudioTableState<HeaderMetadata>;
	onHeaderResize: (idx: number, newWidth: number) => void;
	onContextMenu?: React.MouseEventHandler;
	renderHeader: (props: StudioTableHeaderProps<HeaderMetadata>) => ReactElement;
}) {
	const className = cn(
		sticky ? "z-30" : undefined,
		"bg-background border-r border-b overflow-hidden sticky top-0 h-[35px] leading-[35px] flex text-left z-10 p-0 border-border"
	);

	return (
		<th
			key={header.name}
			title={header.display.tooltip}
			className={className}
			onContextMenu={onContextMenu}
			style={{
				left: sticky ? state.gutterColumnWidth : undefined,
			}}
		>
			{renderHeader(header)}
			{header.setting.resizable && (
				<StudioTableHeaderResizer idx={idx + 1} onResize={onHeaderResize} />
			)}
		</th>
	);
}
