import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Rich } from "./Rich";

afterEach(cleanup);

it("Rich: **negrito** e `código`, sem interpretar HTML", () => {
  const { container } = render(<p><Rich text={"Clique em **Conectar** e use `http://x` <img src=x>"} /></p>);
  expect(container.querySelector("b")?.textContent).toBe("Conectar");
  expect(container.querySelector("code")?.textContent).toBe("http://x");
  expect(container.querySelector("img")).toBeNull();
  expect(container.textContent).toBe("Clique em Conectar e use http://x <img src=x>");
});
