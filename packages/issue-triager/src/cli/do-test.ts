import 'dotenv/config';
import { spinner as cliSpinner } from '@cloudflare/cli/interactive';
import chalk from 'chalk';

import { embedIssues, fetchLastUpdatedTimestamp, setLastUpdatedTimestamp } from './ai/embeddings';
import { getIssuesWithComments } from './github/get-issues-with-comments';

const BATCH_SIZE = 50;

doTest();

async function doTest() {
	const spinner = cliSpinner();

	spinner.start(chalk.gray('Fetching last updated timestamp'));
	const lastUpdatedTimestamp = await fetchLastUpdatedTimestamp();
	spinner.stop(chalk.green(`Retrieved last updated timestamp ${lastUpdatedTimestamp}`));

	const dummyTimestamp = '2024-06-20T09:30:46Z';

	spinner.start(chalk.gray(`Updating ${dummyTimestamp} on remote`));
	const message = await setLastUpdatedTimestamp(dummyTimestamp);
	spinner.stop(chalk.green(message));
}
