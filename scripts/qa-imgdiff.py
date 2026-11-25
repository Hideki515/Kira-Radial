"""Compara as capturas de duas pastas (A e B) de uma sonda do QA.

Para cada <nome>.png que existe nas duas, conta os pixels que diferem (diferença > 8 em
qualquer canal, inclusive o alfa), dá a maior diferença e a caixa onde está a diferença.
Grava diff-<nome>.png em <saída>. Imprime um JSON com o resumo.

Uso: python -I scripts/qa-imgdiff.py <pastaA> <pastaB> <saída>
"""
import json
import os
import sys

from PIL import Image, ImageChops


def mask_of(diff: Image.Image) -> Image.Image:
    """255 onde algum canal (R, G, B ou A) difere mais que 8."""
    bands = [band.point(lambda p: 255 if p > 8 else 0) for band in diff.split()]
    m = bands[0]
    for b in bands[1:]:
        m = ImageChops.lighter(m, b)
    return m


def main() -> None:
    a_dir, b_dir, out_dir = sys.argv[1:4]
    os.makedirs(out_dir, exist_ok=True)
    out = {}
    for name in sorted(os.listdir(b_dir)):
        if not name.endswith(".png") or not os.path.exists(os.path.join(a_dir, name)):
            continue
        a = Image.open(os.path.join(a_dir, name)).convert("RGBA")
        b = Image.open(os.path.join(b_dir, name)).convert("RGBA")
        if a.size != b.size:
            out[name[:-4]] = {"error": f"tamanhos diferentes {a.size} x {b.size}"}
            continue
        d = ImageChops.difference(a, b)
        mask = mask_of(d)
        px = mask.histogram()[255]
        entry = {"px": px, "max": max(ch[1] for ch in d.getextrema())}
        if px:
            entry["box"] = mask.getbbox()
            # Diferença em destaque (vermelho) sobre B desbotada.
            faded = Image.blend(b, Image.new("RGBA", b.size, (255, 255, 255, 255)), 0.6)
            faded.paste(Image.new("RGBA", b.size, (255, 0, 0, 255)), mask=mask)
            faded.save(os.path.join(out_dir, f"diff-{name}"))
        out[name[:-4]] = entry
    print(json.dumps(out))


if __name__ == "__main__":
    main()
