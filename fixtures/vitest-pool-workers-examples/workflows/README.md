# 🔁 workflows

This Worker includes two Workflows: a basic workflow that runs a single step and completes `TestWorkflow`, and a long-running worflow that includes more steps `TestLongWorkflow`.
The testing suite uses workflow mocking to validate the logic of each step.

| Test                                            | Overview                                                                                                    |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [integration.test.ts](test/integration.test.ts) | Tests on the Worker's endpoints, ensuring that workflows are created correctly and statuses can be fetched. |
| [unit.test.ts](test/unit.test.ts)               | Tests on the internal logic of each workflow. It uses mocking to test steps in isolation.                   |
