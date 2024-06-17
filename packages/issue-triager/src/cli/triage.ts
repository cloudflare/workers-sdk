import 'dotenv/config';
import { spinner as cliSpinner } from '@cloudflare/cli/interactive';
import chalk from 'chalk';
import inquirer from 'inquirer';
import open from 'open';
import { classifyIssue } from './ai/text-generation';
import { getUntriagedIssues } from './github/get-untriaged-issues';

main();

async function main() {
	const spinner = cliSpinner();

	spinner.start(chalk.gray('Fetching untriaged items'));
	const issues = await getUntriagedIssues();
	spinner.stop(chalk.green(`${issues.length} untriaged issues fetched successfully`));

	while (true) {
		const { selectedIssue } = await inquirer.prompt([
			{
				type: 'list',
				name: 'selectedIssue',
				message: 'Select an issue to classify (or "ctrl+c" to quit):',
				choices: [
					{ name: 'Exit', value: null },
					...issues.map((issue, index) => ({
						name: `${index + 1}. ${issue.title}`,
						value: issue,
					})),
				],
				pageSize: 20,
			},
		]);

		spinner.start(chalk.gray('Classifying issue'));
		const classification = await classifyIssue(selectedIssue);

		if (!classification) {
			console.log(chalk.red('Could not create classification from issue'));
			continue;
		}

		spinner.stop(chalk.green('Issues classified successfully'));
		console.log(classification, '\n\n');

		const { nextAction } = await inquirer.prompt([
			{
				type: 'list',
				name: 'nextAction',
				message: 'What would you like to do next?',
				choices: [
					{ name: 'Open the issue on GitHub', value: 'open' },
					{ name: 'Classify another issue', value: 'classify' },
					{ name: 'Exit', value: 'exit' },
				],
			},
		]);

		if (nextAction === 'open') {
			await open(selectedIssue.url);
			console.log(chalk.gray('Opening the issue on GitHub...'));
		} else if (nextAction === 'exit') {
			console.log(chalk.gray('Exiting issue classification.'));
			break;
		}
	}
}
