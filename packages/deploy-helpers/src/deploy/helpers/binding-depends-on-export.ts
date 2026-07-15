/**
 * Build the user-facing error message for EWC code 100406
 * (an actor binding references a Durable Object class declared in `exports`
 * but not yet provisioned, on `wrangler versions upload`).
 *
 * EWC's own message is already fully actionable — it names the offending
 * binding and class and spells out both remediations (deploy to provision, or
 * drop the binding and use `ctx.exports.<ClassName>`). We surface it verbatim
 * rather than re-deriving a less specific message client-side. The fallback is
 * only used in the unlikely event the server sends an empty message.
 */
export function renderBindingDependsOnExportError(
	serverMessage: string
): string {
	const trimmed = serverMessage.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return "A Durable Object binding references a class declared in `exports` but not yet provisioned. Declarative `exports` are reconciled when the version is deployed. Deploy this version to provision the class, or remove the binding and access the Durable Object via `ctx.exports.<ClassName>` until then.";
}
