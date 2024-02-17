/**
 * Strips a name to a valid binding name which must be a valid JS identifiers.
 */
export function getValidBindingName(
	binding: string
) {
  return binding.replace(/[\s-]/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
}
