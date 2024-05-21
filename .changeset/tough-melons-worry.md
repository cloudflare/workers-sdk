---
"create-cloudflare": minor
---

feature: Use `create-vite` instead of `create-react-app` for React projects.

[React's documentation](https://react.dev/learn/start-a-new-react-project#can-i-use-react-without-a-framework) now recommends using `create-vite` over `create-react-app`, as the latter has been deprecated. To align with these best practices, React projects created with C3 will now use [Vite](https://vitejs.dev/).

With this change, the default development command will switch from using `create-react-app` to `create-vite`, providing a more modern and efficient development experience.

Additionally, selection of variants for React projects created by Vite has been added, allowing users to choose different configurations based on their needs. The test suite has also been adapted to accommodate the new configuration, ensuring all tests run without errors.
