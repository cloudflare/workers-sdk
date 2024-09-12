# Asset config fixture

This is testing the asset worker in the workers-shared package. We cannot use the vitest integration directly in that package because it results in circular dependencies.

Since it runs tests in a workerd context and doesn't depend on the host OS, this fixture only runs test on Linux to reduce wasted time in CI.
