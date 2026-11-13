import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Circle, GitBranch } from "lucide-react";
import { ICONS, getIcon } from "./icons";
import { defaultConfig } from "./defaults";

// QA v0.20.4 (lucide-react 1.x): todo ícone do registro existe e desenha um <svg>.
describe("registro de ícones (lucide 1.x)", () => {
  it("todas as entradas de ICONS renderizam um svg", () => {
    for (const [name, Icon] of Object.entries(ICONS)) {
      expect(Icon, name).toBeTruthy();
      const { container, unmount } = render(<Icon size={16} />);
      expect(container.querySelector("svg"), name).not.toBeNull();
      unmount();
    }
  });

  it('"github" (config padrão e salvas) continua resolvendo, agora para GitBranch; nome desconhecido cai no Circle', () => {
    expect(getIcon("github")).toBe(GitBranch);
    expect(getIcon("nao-existe")).toBe(Circle);
  });

  it("todo ícone usado pela config padrão está no registro", () => {
    const names = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) return x.forEach(walk);
      if (x && typeof x === "object") {
        const o = x as Record<string, unknown>;
        if (typeof o.icon === "string" && !o.icon.includes("/") && !o.icon.includes("\\") && !o.icon.includes(".")) names.add(o.icon);
        Object.values(o).forEach(walk);
      }
    };
    walk(defaultConfig);
    for (const n of names) expect(ICONS[n], n).toBeDefined();
  });
});
