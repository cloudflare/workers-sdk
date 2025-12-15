import "./style.css";
import viteLogo from "/vite.svg";
import { setupCounter } from "./counter";
import typescriptLogo from "./typescript.svg";

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <div>
    <a href="https://vite.dev" target="_blank">
      <img src="${viteLogo}" class="logo" alt="Vite logo" />
    </a>
    <a href="https://www.typescriptlang.org/" target="_blank">
      <img src="${typescriptLogo}" class="logo vanilla" alt="TypeScript logo" />
    </a>
    <h1>Vite + TypeScript</h1>
    <div class="card">
      <button id="counter" type="button"></button>
    </div>
    <p class="read-the-docs">
      Click on the Vite and TypeScript logos to learn more
    </p>
  </div>
`;

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
setupCounter(document.querySelector<HTMLButtonElement>("#counter")!);
