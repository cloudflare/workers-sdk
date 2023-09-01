async function bustEntireCache(
	list: R2Objects,
	R2_ARTIFACT_ARCHIVE: Env["R2_ARTIFACT_ARCHIVE"]
) {
	for (const object of list.objects) {
		await R2_ARTIFACT_ARCHIVE.delete(object.key);
	}
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
