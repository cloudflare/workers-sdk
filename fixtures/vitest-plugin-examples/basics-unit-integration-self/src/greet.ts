export function greet(request: Request): string {
	return `👋 ${request.url}`;
}
