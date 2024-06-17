import 'dotenv/config';
import { spinner as cliSpinner } from '@cloudflare/cli/interactive';
import chalk from 'chalk';

import { embedIssues, fetchLastUpdatedTimestamp, setLastUpdatedTimestamp } from './ai/embeddings';
import { getIssuesWithComments } from './github/get-issues-with-comments';

const BATCH_SIZE = 50;

updateEmbeddings();

async function updateEmbeddings() {
	const spinner = cliSpinner();

	spinner.start(chalk.gray('Fetching last updated date'));
	const lastUpdatedTimestamp = await fetchLastUpdatedTimestamp();
	// const lastUpdatedTimestamp = '2024-06-20T09:30:46Z';
	spinner.stop(chalk.green(`Embeddings last updated at ${lastUpdatedTimestamp}`));

	if (lastUpdatedTimestamp === '2000-01-01T00:00:00Z') {
		process.exit(0);
	}

	spinner.start(chalk.gray(`Fetching issues that were updated since ${lastUpdatedTimestamp}`));
	const issues = await getIssuesWithComments({ since: lastUpdatedTimestamp });
	spinner.stop(chalk.green(`${issues.length} issues retreived successfully`));

	const batches = [];
	for (let i = 0; i < issues.length; i += BATCH_SIZE) {
		const batch = issues.slice(i, i + BATCH_SIZE);
		batches.push(batch);
	}

	console.log(chalk.gray(`Split issues into ${batches.length} batches of size ${BATCH_SIZE}`));

	for (const [index, batch] of batches.entries()) {
		spinner.start(chalk.gray(`Sending batch ${index + 1} of ${batches.length}`));
		try {
			const message = await embedIssues(batch);
			spinner.stop(chalk.green(`Batch ${index + 1} response: ${message}`));
		} catch (error) {
			spinner.stop(chalk.red(`Error sending batch ${index + 1}: ${error}`));
		}
	}

	const lastIssue = issues[issues.length - 1];
	spinner.start(chalk.gray(`Updating ${lastIssue.updatedAt} on remote`));
	const message = await setLastUpdatedTimestamp(lastIssue.updatedAt);
	spinner.stop(chalk.green(message));
}
