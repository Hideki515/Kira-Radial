import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { describeAction } from "../shared/describe";
import { setLang } from "../shared/i18n";
import { defaultConfig } from "../shared/defaults";
import type { Action } from "../shared/types";
import { validateAction } from "../shared/validate";
import { ActionEditor } from "../settings/ActionEditor";
import { calcResult, evaluate, formatNumber, isCalcQuery } from "./calc";
import { buildIndex, isSearchChar, search } from "./search";

afterEach(cleanup);

describe("calculadora da busca (v0.35.0)", () => {
  it("contas com precedência, parênteses, potência e menos unário", () => {
    expect(evaluate("2*35")).toBe(70);
    expect(evaluate("2+3*4")).toBe(14);
    expect(evaluate("(2+3)*4")).toBe(20);
    expect(evaluate("2^3^2")).toBe(512);
    expect(evaluate("-3+5")).toBe(2);
    expect(evaluate("-(2+3)")).toBe(-5);
    expect(evaluate("10 % 4")).toBe(2);
    expect(evaluate("7/2")).toBe(3.5);
    expect(evaluate("2,5 x 2")).toBe(5);
    expect(evaluate("3×4÷2")).toBe(6);
    expect(evaluate(".5+.5")).toBe(1);
  });

  it("conta incompleta ou inválida dá null (sem eval)", () => {
    for (const bad of ["", "2+", "(2", "2)", "1/0", "abc", "2**3", "alert(1)", "1e3", "2 3", "(".repeat(60) + "1" + ")".repeat(60)]) {
      expect(evaluate(bad), bad).toBeNull();
    }
    expect(evaluate("1".repeat(201))).toBeNull();
  });

  it("resultado no formato do idioma, sem ruído de ponto flutuante", () => {
    expect(formatNumber(0.1 + 0.2)).toBe("0,3");
    expect(formatNumber(1234567.5)).toBe("1234567,5");
    expect(formatNumber(-2)).toBe("-2");
    setLang("en");
    expect(formatNumber(0.1 + 0.2)).toBe("0.3");
    setLang("pt");
  });

  it("'=' vira uma fatia com o resultado que cola o número", () => {
    expect(isCalcQuery(" =1")).toBe(true);
    expect(calcResult("abc")).toBeNull();
    expect(calcResult("=2*")).toBeNull();
    expect(calcResult("=2*35")).toEqual({ id: "__calc", label: "= 70", icon: "calculator", action: { type: "text", text: "70", restoreClipboard: true } });
    const index = buildIndex(defaultConfig.profiles);
    expect(search(index, "=10/4", defaultConfig.profiles[0].id).map((r) => r.label)).toEqual(["= 2,5"]);
    expect(search(index, "=10/", defaultConfig.profiles[0].id)).toEqual([]);
  });

  it("as teclas da conta entram na busca", () => {
    const k = (key: string) => isSearchChar({ key, ctrlKey: false, altKey: false, metaKey: false });
    for (const key of ["=", "*", "(", ")", "%", "^", ",", "+", "-", "/"]) expect(k(key), key).toBe(true);
    expect(k("Enter")).toBe(false);
  });
});

describe("ação Texto pronto (v0.35.0)", () => {
  it("validação, descrição e limite", () => {
    expect(validateAction({ type: "text", text: "  " })).toBe("o texto está vazio.");
    expect(validateAction({ type: "text", text: "x".repeat(10_001) })).toBe("o texto passa de 10000 caracteres.");
    expect(validateAction({ type: "text", text: "Olá {data}" })).toBeNull();
    expect(describeAction({ type: "text", text: "Bom dia,\n  equipe!" })).toBe("Colar texto: Bom dia, equipe!");
    expect(describeAction({ type: "text", text: "a".repeat(40) })).toBe(`Colar texto: ${"a".repeat(29)}…`);
  });

  it("editor: digita, insere variável no cursor, conta caracteres e liga/desliga a devolução", () => {
    let last: Action | null = null;
    function H() {
      const [a, setA] = useState<Action>({ type: "text", text: "" });
      return <ActionEditor action={a} onChange={(n) => (setA(n), (last = n))} />;
    }
    const { container } = render(<H />);
    const area = container.querySelector("textarea")!;
    fireEvent.change(area, { target: { value: "Hoje: " } });
    area.setSelectionRange(6, 6);
    fireEvent.click(screen.getByRole("button", { name: "{data}" }));
    expect(last).toEqual({ type: "text", text: "Hoje: {data}" });
    expect(screen.getByText("12 de 10000 caracteres")).toBeTruthy();
    const toggle = screen.getByRole("checkbox", { name: /Devolver a área de transferência/ }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    expect(last).toEqual({ type: "text", text: "Hoje: {data}", restoreClipboard: false });
  });

  it("em inglês os botões inserem o nome em inglês", () => {
    setLang("en");
    let last: Action | null = null;
    function H() {
      const [a, setA] = useState<Action>({ type: "text", text: "" });
      return <ActionEditor action={a} onChange={(n) => (setA(n), (last = n))} />;
    }
    render(<H />);
    fireEvent.click(screen.getByRole("button", { name: "{datetime}" }));
    expect(last).toEqual({ type: "text", text: "{datetime}" });
    expect(describeAction({ type: "text", text: "hi" })).toBe("Paste text: hi");
    setLang("pt");
  });
});
