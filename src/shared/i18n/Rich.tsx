// Texto traduzido com marcação mínima: **negrito** e `código`. Não interpreta HTML.
import { Fragment } from "react";

export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <b key={i}>{p.slice(2, -2)}</b>
        ) : p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i}>{p.slice(1, -1)}</code>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}
