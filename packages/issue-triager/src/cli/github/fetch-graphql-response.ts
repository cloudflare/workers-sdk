import chalk from 'chalk';

/**
 * The GraphQL API has been a little bit flaky, so this function has been extracted in order to abstract
 * the default ability to retry up to 5 times.
 */
export async function fetchGraphQlResponse<T>(query: string, variables: Record<string, string | null> = {}): Promise<T> {
	const maxRetries = 5;
	let retries = 0;

	while (retries < maxRetries) {
		try {
			const response = await fetch('https://api.github.com/graphql', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${process.env.GITHUB_API_TOKEN}`,
				},
				body: JSON.stringify({ query, variables }),
			});

			if (response.ok) {
				return (await response.json()) as T;
			} else {
				throw new Error(`HTTP error! status: ${response.status}`);
			}
		} catch (error) {
			retries++;
			console.log(chalk.red(`Fetch failed (attempt ${retries}): ${error}`));

			if (retries === maxRetries) {
				throw new Error(`Failed to fetch GraphQL response after ${maxRetries} retries.`);
			}

			// Exponential backoff delay
			const delay = Math.pow(2, retries) * 1000;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw new Error('Unexpected error: Retry loop exited without throwing an error.');
}
