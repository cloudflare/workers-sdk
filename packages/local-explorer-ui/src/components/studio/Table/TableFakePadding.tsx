import type { PropsWithChildren } from "react";

/**
 * Renders a `<tbody>` element with fake padding rows at the top and bottom of the table.
 * These padding rows represent the areas of the table that are outside of the viewport.
 *
 * The height of the padding rows is calculated based on the `rowHeight` and the range of
 * visible rows (`rowStart` to `rowEnd`). This ensures that the table maintains its overall
 * height and structure while only rendering the visible rows.
 *
 * ASCII Visualization:
 *
 * +-------------------+  <- Top of the table (outside viewport)
 * |                   |
 * |   Fake Padding    |  <- Fake padding row (height = rowStart * rowHeight)
 * |       Top         |
 * |                   |
 * +-------------------+  <- Start of visible rows
 * |                   |
 * |     Visible       |
 * |     Viewport      |
 * |                   |
 * +-------------------+  <- End of visible rows
 * |                   |
 * |   Fake Padding    |
 * |      Bottom       |  <- Fake padding row (height = (rowCount - rowEnd) * rowHeight)
 * |                   |
 * +-------------------+  <- Bottom of the table (outside viewport)
 */
export function StudioTableFakeBodyPadding({
	children,
	colCount,
	rowHeight,
	rowCount,
	rowStart,
	rowEnd,
}: PropsWithChildren<{
	rowHeight: number;
	colCount: number;
	rowCount: number;
	rowStart: number;
	rowEnd: number;
}>) {
	const paddingTop = rowStart * rowHeight;
	const paddingBottom = (rowCount - rowEnd) * rowHeight;

	return (
		<tbody className="contents">
			{!!paddingTop && (
				<tr key="padding-top" className="contents">
					<td
						style={{
							height: paddingTop,
							gridColumn: `span ${colCount + 1}`,
						}}
					/>
				</tr>
			)}

			{children}

			{!!paddingBottom && (
				<tr className="contents" key="padding-bottom">
					<td
						style={{
							height: paddingBottom,
							gridColumn: `span ${colCount + 1}`,
						}}
					></td>
				</tr>
			)}
		</tbody>
	);
}

/**
 * Renders a fake padding cell in the table header.
 *
 * +-------------------+-----------------+-------------------+
 * |                   |                 |                   |
 * | Fake Padding Left |  Visible Cells  | Fake Padding Right|
 * |                   |                 |                   |
 * +-------------------+-----------------+-------------------+
 */
export function StudioTableFakeRowPadding({
	colStart,
	colEnd,
}: {
	colEnd: number;
	colStart: number;
}) {
	return colEnd - colStart > 0 ? (
		<td
			style={{
				gridColumn: `span ${colEnd - colStart}`,
			}}
		/>
	) : (
		<></>
	);
}
