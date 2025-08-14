async function bustEntireCache(
	list: R2Objects,
	R2_ARTIFACT_ARCHIVE: Env["R2_ARTIFACT_ARCHIVE"]
) {
	const allObjectKeys = list.objects.map((o) => o.key);

	await R2_ARTIFACT_ARCHIVE.delete(allObjectKeys);
}

export async function bustOldCache(
	R2_ARTIFACT_ARCHIVE: Env["R2_ARTIFACT_ARCHIVE"],
	cursor?: string
) {
	const list = await R2_ARTIFACT_ARCHIVE.list({
		limit: 500,
		cursor,
	});
	await bustEntireCache(list, R2_ARTIFACT_ARCHIVE);

	if (list.truncated) {
		await bustOldCache(R2_ARTIFACT_ARCHIVE, list.cursor);
	}
}
