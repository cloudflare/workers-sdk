import 'dotenv/config';
import { spinner as cliSpinner } from '@cloudflare/cli/interactive';
import chalk from 'chalk';

import { embedIssues, fetchLastUpdatedTimestamp, setLastUpdatedTimestamp } from './ai/embeddings';
import { getIssuesWithComments } from './github/get-issues-with-comments';
import { Issue } from '../shared/types';

const BATCH_SIZE = 50;

updateEmbeddings();

async function updateEmbeddings() {
	const spinner = cliSpinner();

	spinner.start(chalk.gray('Fetching last updated date'));
	const lastUpdatedTimestamp = await fetchLastUpdatedTimestamp();
	spinner.stop(chalk.green(`Embeddings last updated at ${lastUpdatedTimestamp}`));

	spinner.start(chalk.gray(`Fetching GitHub issues that were updated since ${lastUpdatedTimestamp}`));
	const issues = await getIssuesWithComments({ since: lastUpdatedTimestamp });

	if (issues.length) {
		spinner.stop(chalk.green(`${issues.length} issues retreived.`));
	} else {
		spinner.stop(chalk.green(`0 issues retreived. Embeddings up-to-date.`));
		return;
	}

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

	const latestUpdatedIssue = findLatestUpdatedIssue(issues);

	spinner.start(chalk.gray(`Updating ${latestUpdatedIssue.updatedAt} on remote`));
	const message = await setLastUpdatedTimestamp(latestUpdatedIssue.updatedAt);
	spinner.stop(chalk.green(message));
}

function findLatestUpdatedIssue(issues: Issue[]) {
	return issues.reduce((latest, current) => (current.updatedAt > latest.updatedAt ? current : latest));
}
