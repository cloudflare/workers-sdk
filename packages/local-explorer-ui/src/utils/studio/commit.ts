import type {
	StudioTableState,
	StudioTableStateRow,
} from "../../components/studio/Table/State";
import type {
	IStudioDriver,
	StudioTableRowMutationRequest,
	StudioTableSchema,
} from "../../types/studio";

interface StudioExecutePlan {
	row: StudioTableStateRow;
	plan: StudioTableRowMutationRequest;
}

// TODO: Re-add in a later PR from `components/studio/Table/StateHelpers`
type StudioResultHeaderMetadata = object;

export async function commitStudioTableChanges({
	data,
	driver,
	tableName,
	tableSchema,
}: {
	data: StudioTableState<StudioResultHeaderMetadata>;
	driver: IStudioDriver;
	tableName: string;
	tableSchema: StudioTableSchema;
}): Promise<{
	errorMessage?: string;
}> {
	const plans = buildStudioMutationPlans({
		data,
		tableSchema,
	});

	try {
		const result = await driver.mutateTableRows(
			tableSchema.schemaName,
			tableName,
			plans.map((p) => p.plan),
			tableSchema
		);

		data.applyChanges(
			plans.map((p, idx) => ({
				row: p.row,
				updated: result[idx]?.record ?? {},
			}))
		);
	} catch (e) {
		return {
			errorMessage: e instanceof Error ? e.message : String(e),
		};
	}

	return {};
}

export function buildStudioMutationPlans({
	data,
	tableSchema,
}: {
	data: StudioTableState<StudioResultHeaderMetadata>;
	tableSchema: StudioTableSchema;
}): StudioExecutePlan[] {
	const rowChangeList = data.getChangedRows();

	const plans = new Array<StudioExecutePlan>();
	for (const row of rowChangeList) {
		const rowChange = row.change;
		if (rowChange) {
			const pk = tableSchema.pk;

			const wherePrimaryKey = pk.reduce<Record<string, unknown>>(
				(condition, pkColumnName) => {
					condition[pkColumnName] = row.raw[pkColumnName];
					return condition;
				},
				{}
			);

			if (row.isNewRow) {
				plans.push({
					plan: {
						autoIncrementPkColumn: tableSchema.autoIncrement
							? tableSchema.pk[0]
							: undefined,
						operation: "INSERT",
						pk: tableSchema.pk,
						values: rowChange,
					},
					row,
				});
				continue;
			}

			if (row.isRemoved) {
				plans.push({
					plan: {
						operation: "DELETE",
						where: wherePrimaryKey,
					},
					row,
				});
				continue;
			}

			plans.push({
				plan: {
					operation: "UPDATE",
					where: wherePrimaryKey,
					values: rowChange,
				},
				row,
			});
		}
	}

	return plans;
}
