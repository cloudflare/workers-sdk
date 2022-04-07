import { execa } from "execa";

export const buildWebpackPlugin = () => {
  beforeAll(async () => {
    await execa("npm", ["run", "build:js"]);
  });
};
