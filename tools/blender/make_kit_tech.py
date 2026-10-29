#!/usr/bin/env python3.11
"""Kit modular "três camadas" de São Paulo Velha (2072) em Blender headless → public/assets/environments/kit_tech.glb

Camadas (docs/DIRECAO_ARTE.md): base antiga (FACHADA_*), camada tecnológica 2043–2056 (TECH_*), remendos
2057–2072 (REMENDO_*), marcos monumentais (MARCO_*) e props brasileiros (PROP_*). Reaproveita as primitivas,
materiais PBR (ambientCG, CC0) e a exportação de make_environment.py.

Convenções (iguais ao praca_hero.glb): metros; cada peça é um nó raiz com a geometria na própria origem,
frente para -Y no Blender (= +Z no glTF/Babylon); colisores são malhas "COL_*" dentro da peça.
Módulo de fachada = 6 m de largura × 1 pavimento (3 m); peças de topo e de esquina fecham os volumes.

Uso: python3.11 tools/blender/make_kit_tech.py [--out public/assets/environments/kit_tech.glb] [--only A,B] [--list]
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import sys
import time

import bpy  # noqa: E402 — precisa vir antes de bmesh
import bmesh
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_environment as env  # noqa: E402
from make_environment import box, cylinder, torus, sphere, wavy_plane, cut, pbr, textured_plain, apply_modifiers, box_uv, smooth_by_angle, image, _noise  # noqa: E402

REPO = env.REPO
GEN = os.path.join(HERE, ".cache", "kit")
os.makedirs(GEN, exist_ok=True)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MOD_W, FLOOR_H, WALL_D = 6.0, 3.0, 0.5
TAU = math.tau


def log(*a):
    print("[make_kit_tech]", *a, flush=True)


# ---------------------------------------------------------------------------
# Texturas procedurais (PIL) — cor, altura→normal, rugosidade, emissivo, alpha
# ---------------------------------------------------------------------------
def _cached(name: str, ext: str, make):
    path = os.path.join(GEN, f"{name}.{ext}")
    if not os.path.exists(path):
        img = make()
        img.save(path)
    return path


def normal_from_height(h, strength: float = 2.0):
    """Mapa de normais (OpenGL, +Y para cima) a partir de uma imagem de altura em 'L'."""
    from PIL import Image, ImageChops, ImageFilter

    scale = max(1e-3, 4.0 / strength)
    gx = h.filter(ImageFilter.Kernel((3, 3), [-1, 0, 1, -2, 0, 2, -1, 0, 1], scale=scale, offset=128))
    gy = h.filter(ImageFilter.Kernel((3, 3), [-1, -2, -1, 0, 0, 0, 1, 2, 1], scale=scale, offset=128))
    r = ImageChops.invert(gx)
    b = Image.new("L", h.size, 255)
    return Image.merge("RGB", (r, gy, b))


def text_image(size, lines, bg, fg, font_px, pad=0.08, align="center"):
    """Placa com texto centrado (DejaVu Sans Bold) — nomes fictícios, sem marcas."""
    from PIL import Image, ImageDraw, ImageFont

    img = Image.new("RGBA", size, bg)
    d = ImageDraw.Draw(img)
    font = ImageFont.truetype(FONT, font_px)
    total = len(lines) * font_px * 1.25
    y = (size[1] - total) / 2
    for line in lines:
        w = d.textlength(line, font=font)
        x = (size[0] - w) / 2 if align == "center" else size[0] * pad
        d.text((x, y), line, font=font, fill=fg)
        y += font_px * 1.25
    return img


def tex_pv(size=512):
    """Painel fotovoltaico: células azul-escuras com barramentos prateados, moldura de alumínio."""
    from PIL import Image, ImageDraw

    def color():
        img = Image.new("RGB", (size, size), (120, 124, 128))
        d = ImageDraw.Draw(img)
        m = int(size * 0.025)
        d.rectangle([m, m, size - m, size - m], fill=(18, 26, 52))
        cols, rows = 6, 10
        cw, ch = (size - 2 * m) / cols, (size - 2 * m) / rows
        rnd = random.Random(3)
        for i in range(cols):
            for j in range(rows):
                x0, y0 = m + i * cw, m + j * ch
                shade = 0.85 + 0.3 * rnd.random()
                col = (int(22 * shade), int(38 * shade), int(92 * shade))
                d.rectangle([x0 + 2, y0 + 2, x0 + cw - 2, y0 + ch - 2], fill=col)
                # cantos chanfrados das células (wafer mono)
                for cx, cy in ((x0 + 2, y0 + 2), (x0 + cw - 2, y0 + 2), (x0 + 2, y0 + ch - 2), (x0 + cw - 2, y0 + ch - 2)):
                    d.rectangle([cx - 3, cy - 3, cx + 3, cy + 3], fill=(18, 26, 52))
            # barramentos verticais
            for k in (0.33, 0.66):
                x = m + i * cw + cw * k
                d.line([(x, m), (x, size - m)], fill=(170, 175, 180), width=max(1, size // 256))
        return img

    def height():
        img = Image.new("L", (size, size), 200)
        d = ImageDraw.Draw(img)
        m = int(size * 0.025)
        d.rectangle([m, m, size - m, size - m], fill=120)
        cols, rows = 6, 10
        cw, ch = (size - 2 * m) / cols, (size - 2 * m) / rows
        for i in range(cols):
            for j in range(rows):
                x0, y0 = m + i * cw, m + j * ch
                d.rectangle([x0 + 2, y0 + 2, x0 + cw - 2, y0 + ch - 2], fill=135)
        return img

    def rough():
        img = Image.new("L", (size, size), 140)
        d = ImageDraw.Draw(img)
        m = int(size * 0.025)
        d.rectangle([m, m, size - m, size - m], fill=35)
        return img

    return (_cached("pv_color", "png", color), _cached("pv_normal", "png", lambda: normal_from_height(height(), 2.5)), _cached("pv_rough", "png", rough))


def tex_pv_cracked(size=512):
    """Variante do painel com vidro trincado (linhas claras irradiando de dois impactos)."""
    from PIL import Image, ImageDraw

    def color():
        base = Image.open(tex_pv(size)[0]).convert("RGB")
        d = ImageDraw.Draw(base)
        rnd = random.Random(9)
        for cx, cy in ((size * 0.3, size * 0.4), (size * 0.72, size * 0.75)):
            for k in range(14):
                a = rnd.random() * TAU
                length = size * (0.12 + 0.3 * rnd.random())
                pts = [(cx, cy)]
                for s in range(1, 5):
                    pts.append((cx + math.cos(a + (rnd.random() - 0.5) * 0.5) * length * s / 4, cy + math.sin(a + (rnd.random() - 0.5) * 0.5) * length * s / 4))
                d.line(pts, fill=(190, 200, 215), width=max(1, size // 400))
            d.ellipse([cx - 6, cy - 6, cx + 6, cy + 6], fill=(230, 232, 236))
        return base

    return _cached("pv_cracked_color", "png", color)


def tex_led(name: str, lines, hue=(120, 220, 255), size=(128, 512), dead=0.22, seed=1):
    """Letreiro LED em bandeira (vertical): texto fictício emissivo, colunas de LEDs mortas e linhas apagadas."""
    from PIL import Image, ImageDraw

    def emissive():
        img = Image.new("RGBA", size, (0, 0, 0, 255))
        txt = text_image((size[1], size[0]), lines, (0, 0, 0, 255), (*hue, 255), int(size[0] * 0.42))
        txt = txt.rotate(90, expand=True)
        img.paste(txt, (0, 0))
        d = ImageDraw.Draw(img)
        rnd = random.Random(seed)
        # grade de LEDs: linhas escuras finas a cada 4 px e colunas mortas
        for y in range(0, size[1], 4):
            d.line([(0, y), (size[0], y)], fill=(0, 0, 0, 255), width=1)
        for x in range(0, size[0], 4):
            if rnd.random() < dead:
                d.line([(x, 0), (x, size[1])], fill=(0, 0, 0, 255), width=3)
        # faixa inferior apagada (fonte queimada)
        d.rectangle([0, int(size[1] * 0.93), size[0], size[1]], fill=(0, 0, 0, 255))
        return img

    def color():
        img = Image.open(emissive_path).convert("RGB").point(lambda v: int(v * 0.25) + 18)
        return img

    emissive_path = _cached(f"led_{name}_emit", "png", emissive)
    return _cached(f"led_{name}_color", "png", color), emissive_path


def tex_stripes_warning(size=256):
    from PIL import Image, ImageDraw

    def make():
        img = Image.new("RGB", (size, size), (225, 180, 30))
        d = ImageDraw.Draw(img)
        w = size // 4
        for k in range(-2, 6):
            d.polygon([(k * w, 0), (k * w + w // 2, 0), (k * w + w // 2 - size, size), (k * w - size, size)], fill=(30, 30, 32))
        px = img.load()
        rnd = random.Random(5)
        for _ in range(size * 6):
            x, y = rnd.randrange(size), rnd.randrange(size)
            c = px[x, y]
            f = 0.6 + 0.4 * rnd.random()
            px[x, y] = (int(c[0] * f), int(c[1] * f), int(c[2] * f))
        return img

    return _cached("warning", "png", make)


def tex_clothes(size=512):
    """Roupas no varal (alpha): camisa, calça, toalha, vestido — cada uma num quadrante (u,v)."""
    from PIL import Image, ImageDraw

    def make():
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        h = size // 2
        # camisa (quadrante 0,0): corpo + mangas curtas
        c = (232, 226, 204, 255)
        d.polygon([(h * 0.3, h * 0.2), (h * 0.7, h * 0.2), (h * 0.92, h * 0.4), (h * 0.8, h * 0.52), (h * 0.72, h * 0.46), (h * 0.72, h * 0.95), (h * 0.28, h * 0.95), (h * 0.28, h * 0.46), (h * 0.2, h * 0.52), (h * 0.08, h * 0.4)], fill=c)
        d.polygon([(h * 0.42, h * 0.2), (h * 0.5, h * 0.3), (h * 0.58, h * 0.2)], fill=(0, 0, 0, 0))
        for k in range(5):
            d.ellipse([h * 0.49, h * (0.33 + k * 0.12), h * 0.515, h * (0.355 + k * 0.12)], fill=(120, 110, 90, 255))
        # calça (quadrante 1,0)
        ox = h
        c = (60, 70, 95, 255)
        d.polygon([(ox + h * 0.3, h * 0.08), (ox + h * 0.7, h * 0.08), (ox + h * 0.74, h * 0.96), (ox + h * 0.56, h * 0.96), (ox + h * 0.5, h * 0.45), (ox + h * 0.44, h * 0.96), (ox + h * 0.26, h * 0.96)], fill=c)
        d.rectangle([ox + h * 0.3, h * 0.08, ox + h * 0.7, h * 0.14], fill=(45, 52, 72, 255))
        # toalha (quadrante 0,1) com listras
        oy = h
        d.rectangle([h * 0.12, oy + h * 0.1, h * 0.88, oy + h * 0.9], fill=(190, 90, 70, 255))
        for k in range(3):
            d.rectangle([h * 0.12, oy + h * (0.22 + k * 0.22), h * 0.88, oy + h * (0.28 + k * 0.22)], fill=(236, 220, 200, 255))
        # vestido (quadrante 1,1)
        c = (110, 140, 100, 255)
        d.polygon([(ox + h * 0.36, oy + h * 0.1), (ox + h * 0.64, oy + h * 0.1), (ox + h * 0.7, oy + h * 0.36), (ox + h * 0.9, oy + h * 0.94), (ox + h * 0.1, oy + h * 0.94), (ox + h * 0.3, oy + h * 0.36)], fill=c)
        d.polygon([(ox + h * 0.44, oy + h * 0.1), (ox + h * 0.5, oy + h * 0.2), (ox + h * 0.56, oy + h * 0.1)], fill=(0, 0, 0, 0))
        # desgaste: pontos escuros aleatórios
        px = img.load()
        rnd = random.Random(2)
        for _ in range(4000):
            x, y = rnd.randrange(size), rnd.randrange(size)
            r, g, b, a = px[x, y]
            if a:
                f = 0.85 + 0.15 * rnd.random()
                px[x, y] = (int(r * f), int(g * f), int(b * f), a)
        return img

    return _cached("clothes", "png", make)


def tex_glass_broken(size=512):
    """Vidro de fachada: 4 variantes (2×2): inteiro sujo, trincado, com canto faltando, estilhaçado (alpha)."""
    from PIL import Image, ImageDraw

    def make():
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        h = size // 2
        glass = (62, 84, 96, 255)
        rnd = random.Random(21)
        for q, (ox, oy) in enumerate(((0, 0), (h, 0), (0, h), (h, h))):
            d.rectangle([ox, oy, ox + h - 1, oy + h - 1], fill=glass)
            # sujeira/manchas
            for _ in range(40):
                x, y = ox + rnd.random() * h, oy + rnd.random() * h
                r = h * (0.02 + 0.08 * rnd.random())
                d.ellipse([x - r, y - r, x + r, y + r], fill=(int(80 + 30 * rnd.random()), int(100 + 25 * rnd.random()), int(105 + 25 * rnd.random()), 255))
            if q >= 1:
                cx, cy = ox + h * (0.3 + 0.4 * rnd.random()), oy + h * (0.3 + 0.4 * rnd.random())
                for k in range(12):
                    a = rnd.random() * TAU
                    pts = [(cx, cy)]
                    for s in range(1, 5):
                        pts.append((cx + math.cos(a + (rnd.random() - 0.5) * 0.6) * h * 0.45 * s / 4, cy + math.sin(a + (rnd.random() - 0.5) * 0.6) * h * 0.45 * s / 4))
                    d.line(pts, fill=(235, 240, 245, 255), width=2)
            if q == 2:
                d.polygon([(ox, oy + h * 0.55), (ox + h * 0.5, oy + h * 0.7), (ox + h * 0.35, oy + h), (ox, oy + h)], fill=(0, 0, 0, 0))
            if q == 3:
                # cacos: só sobram fragmentos nas bordas
                d.rectangle([ox + h * 0.18, oy + h * 0.15, ox + h * 0.85, oy + h * 0.9], fill=(0, 0, 0, 0))
                for k in range(10):
                    x0 = ox + h * rnd.random()
                    y0 = oy + h * rnd.random()
                    pts = [(x0, y0), (x0 + h * 0.15 * rnd.random(), y0 + h * 0.12 * rnd.random()), (x0 - h * 0.05 * rnd.random(), y0 + h * 0.15 * rnd.random())]
                    d.polygon(pts, fill=glass)
        return img

    return _cached("glass_broken", "png", make)


def tex_cobogo(size=256):
    """Cobogó (elemento vazado): grade de losangos — alpha recortado."""
    from PIL import Image, ImageDraw

    def make():
        img = Image.new("RGBA", (size, size), (205, 195, 178, 255))
        d = ImageDraw.Draw(img)
        n = 4
        c = size / n
        for i in range(n):
            for j in range(n):
                cx, cy = (i + 0.5) * c, (j + 0.5) * c
                r = c * 0.3
                d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], fill=(0, 0, 0, 0))
                d.polygon([(cx, cy - r - 6), (cx + r + 6, cy), (cx, cy + r + 6), (cx - r - 6, cy)], outline=(150, 140, 125, 255), width=2)
        return img

    return _cached("cobogo", "png", make)


def tex_painted_metal(size=512):
    """Chapa pintada com lascas e riscos (altura → normal); cor neutra para tingir."""
    from PIL import Image, ImageDraw

    def color():
        img = Image.new("RGB", (size, size), (200, 200, 196))
        px = img.load()
        rnd = random.Random(13)
        for y in range(size):
            for x in range(size):
                n = _noise(x // 3, y // 3, 4)
                v = int(200 - 18 * n)
                px[x, y] = (v, v, v - 4)
        d = ImageDraw.Draw(img)
        for _ in range(22):
            x, y = rnd.randrange(size), rnd.randrange(size)
            r = rnd.randint(1, 5)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(130, 110, 95))
        for _ in range(30):
            x, y = rnd.randrange(size), rnd.randrange(size)
            d.line([(x, y), (x + rnd.randint(-60, 60), y + rnd.randint(-10, 10))], fill=(120, 118, 112), width=1)
        return img

    def height():
        img = Image.new("L", (size, size), 128)
        d = ImageDraw.Draw(img)
        rnd = random.Random(13)
        for _ in range(22):
            x, y = rnd.randrange(size), rnd.randrange(size)
            r = rnd.randint(1, 5)
            d.ellipse([x - r, y - r, x + r, y + r], fill=100)
        return img

    return _cached("painted_color", "png", color), _cached("painted_normal", "png", lambda: normal_from_height(height(), 3.0))


def tex_tarp(size=256):
    """Lona azul trançada com remendo."""
    from PIL import Image, ImageDraw

    def make():
        img = Image.new("RGB", (size, size), (40, 80, 150))
        px = img.load()
        for y in range(size):
            for x in range(size):
                weave = 0.9 + 0.1 * (((x // 2) + (y // 2)) % 2)
                n = 0.92 + 0.08 * _noise(x // 5, y // 5, 7)
                c = (int(40 * weave * n), int(80 * weave * n), int(150 * weave * n))
                px[x, y] = c
        d = ImageDraw.Draw(img)
        d.rectangle([size * 0.6, size * 0.1, size * 0.9, size * 0.35], fill=(90, 110, 140))
        d.rectangle([size * 0.6, size * 0.1, size * 0.9, size * 0.35], outline=(30, 40, 60), width=2)
        return img

    return _cached("tarp", "png", make)


def tex_crops(size=256):
    """Fileiras de hortaliças vistas de cima (bandejas da fazenda vertical)."""
    from PIL import Image, ImageDraw

    def make():
        img = Image.new("RGB", (size, size), (70, 60, 48))
        d = ImageDraw.Draw(img)
        rnd = random.Random(31)
        for row in range(4):
            for i in range(9):
                cx, cy = (i + 0.5) * size / 9, (row + 0.5) * size / 4
                for k in range(7):
                    a = rnd.random() * TAU
                    r = size * (0.025 + 0.03 * rnd.random())
                    x, y = cx + math.cos(a) * r * 0.7, cy + math.sin(a) * r * 0.7
                    g = int(120 + 80 * rnd.random())
                    d.ellipse([x - r, y - r * 0.6, x + r, y + r * 0.6], fill=(int(g * 0.45), g, int(g * 0.35)))
        return img

    return _cached("crops", "png", make)


def tex_plate(name, lines, bg, fg, size=(512, 256), font_px=70):
    return _cached(f"plate_{name}", "png", lambda: text_image(size, lines, bg, fg, font_px))


def tex_poster(size=512):
    """Dois cartazes de rua (metade esquerda/direita): aviso de racionamento e mutirão — texto fictício."""
    from PIL import Image, ImageDraw

    def make():
        img = Image.new("RGB", (size, size), (120, 110, 95))
        a = text_image((size // 2, size), ["ÁGUA", "RACIONADA", "", "FILA ÀS 6H", "SETOR 17"], (228, 220, 200, 255), (40, 40, 48, 255), 42)
        b = text_image((size // 2, size), ["MUTIRÃO", "DE REPARO", "", "SÁBADO", "QUADRA 03"], (200, 60, 50, 255), (250, 240, 220, 255), 42)
        img.paste(a.convert("RGB"), (0, 0))
        img.paste(b.convert("RGB"), (size // 2, 0))
        d = ImageDraw.Draw(img)
        rnd = random.Random(17)
        for _ in range(160):
            x, y = rnd.randrange(size), rnd.randrange(size)
            r = rnd.randint(2, 14)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(int(120 + 40 * rnd.random()), int(100 + 40 * rnd.random()), int(80 + 40 * rnd.random())))
        d.polygon([(0, size * 0.8), (size * 0.12, size * 0.9), (0, size)], fill=(120, 110, 95))
        d.polygon([(size, 0), (size * 0.9, size * 0.08), (size * 0.8, 0)], fill=(120, 110, 95))
        return img

    return _cached("poster", "png", make)


def tex_lattice(size=256):
    """Engradado plástico: grade de ripas com furos (alpha)."""
    from PIL import Image, ImageDraw

    def make():
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        d.rectangle([0, 0, size, size * 0.12], fill=(200, 200, 200, 255))
        d.rectangle([0, size * 0.88, size, size], fill=(200, 200, 200, 255))
        for k in range(7):
            x = k * size / 6
            d.rectangle([x - size * 0.03, 0, x + size * 0.03, size], fill=(200, 200, 200, 255))
        for k in range(3):
            y = size * (0.3 + k * 0.2)
            d.rectangle([0, y - size * 0.025, size, y + size * 0.025], fill=(200, 200, 200, 255))
        return img

    return _cached("lattice", "png", make)


def tex_pegboard(size=512):
    """Painel de ferramentas da oficina: silhuetas (alpha) de chaves, martelo, alicate, serrote."""
    from PIL import Image, ImageDraw

    def make():
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        dark = (40, 40, 44, 255)
        # chaves de boca
        for i in range(5):
            x = size * (0.1 + i * 0.08)
            d.rectangle([x - 5, size * 0.1, x + 5, size * (0.35 + i * 0.03)], fill=dark)
            d.ellipse([x - 14, size * 0.08 - 10, x + 14, size * 0.08 + 14], fill=dark)
        # martelo
        d.rectangle([size * 0.6, size * 0.1, size * 0.63, size * 0.45], fill=(120, 80, 40, 255))
        d.rectangle([size * 0.52, size * 0.08, size * 0.72, size * 0.15], fill=dark)
        # alicate
        d.polygon([(size * 0.82, size * 0.1), (size * 0.9, size * 0.1), (size * 0.88, size * 0.4), (size * 0.84, size * 0.4)], fill=dark)
        d.polygon([(size * 0.76, size * 0.1), (size * 0.84, size * 0.1), (size * 0.82, size * 0.4), (size * 0.78, size * 0.4)], fill=(200, 40, 40, 255))
        # serrote
        d.polygon([(size * 0.1, size * 0.6), (size * 0.8, size * 0.6), (size * 0.8, size * 0.7), (size * 0.1, size * 0.78)], fill=(180, 180, 185, 255))
        d.rectangle([size * 0.8, size * 0.56, size * 0.92, size * 0.76], fill=(120, 80, 40, 255))
        return img

    return _cached("pegboard", "png", make)


# ---------------------------------------------------------------------------
# Materiais
# ---------------------------------------------------------------------------
def tex_pbr(name: str, color_png: str, normal_png: str | None = None, rough_png: str | None = None, tile: float = 1.0, roughness: float = 0.7, metallic: float = 0.0, tint=(1, 1, 1), emissive_png: str | None = None, emissive_strength: float = 1.0, alpha_mask: bool = False, double_sided: bool = False, normal_strength: float = 1.0) -> bpy.types.Material:
    """Material PBR com texturas procedurais (cor + normal + rugosidade; emissivo; alpha MASK)."""
    if name in env._mats:
        return env._mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m["tile"] = tile
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    col = nt.nodes.new("ShaderNodeTexImage")
    col.image = image(color_png, True)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(col.outputs["Color"], mix.inputs["A"])
    mix.inputs["B"].default_value = (*tint, 1.0)
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    if normal_png:
        nrm = nt.nodes.new("ShaderNodeTexImage")
        nrm.image = image(normal_png, False)
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(nrm.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if rough_png:
        rgh = nt.nodes.new("ShaderNodeTexImage")
        rgh.image = image(rough_png, False)
        nt.links.new(rgh.outputs["Color"], bsdf.inputs["Roughness"])
    else:
        bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emissive_png:
        em = nt.nodes.new("ShaderNodeTexImage")
        em.image = image(emissive_png, True)
        nt.links.new(em.outputs["Color"], bsdf.inputs["Emission Color"])
        bsdf.inputs["Emission Strength"].default_value = emissive_strength
    if alpha_mask:
        rnd_node = nt.nodes.new("ShaderNodeMath")
        rnd_node.operation = "ROUND"
        nt.links.new(col.outputs["Alpha"], rnd_node.inputs[0])
        nt.links.new(rnd_node.outputs[0], bsdf.inputs["Alpha"])
        m.surface_render_method = "DITHERED"
    m.use_backface_culling = not double_sided
    env._mats[name] = m
    return m


def materials():
    M = env.materials()
    pv_c, pv_n, pv_r = tex_pv()
    painted_c, painted_n = tex_painted_metal()
    led_farm = tex_led("farmacia", ["FARMÁCIA"], hue=(110, 230, 255))
    led_agua = tex_led("agua", ["ÁGUA 24H"], hue=(90, 160, 255), dead=0.3, seed=4)
    M.update(
        {
            # base antiga — rebocos extras
            "plaster_green": pbr("plaster_green", "PaintedPlaster017", tint=(0.62, 0.68, 0.58), tile=1.6, rough=1.0),
            "plaster_rose": pbr("plaster_rose", "PaintedPlaster017", tint=(0.82, 0.62, 0.55), tile=1.6, rough=1.0),
            "plaster_blue": pbr("plaster_blue", "PaintedPlaster017", tint=(0.55, 0.64, 0.72), tile=1.6, rough=1.0),
            "plaster_white": pbr("plaster_white", "PaintedPlaster017", tint=(0.92, 0.9, 0.86), tile=1.6, rough=1.0),
            "concrete_ribbed": pbr("concrete_ribbed", "Concrete034", tint=(0.78, 0.78, 0.76), tile=1.0, rough=1.0),
            "tile_dark": pbr("tile_dark", "PavingStones070", tint=(0.45, 0.42, 0.4), tile=1.0, rough=1.0),
            # camada tecnológica
            "pv": tex_pbr("pv", pv_c, pv_n, pv_r, tile=1.0, metallic=0.0),
            "pv_cracked": tex_pbr("pv_cracked", tex_pv_cracked(), pv_n, pv_r, tile=1.0),
            "painted_white": tex_pbr("painted_white", painted_c, painted_n, tile=1.5, roughness=0.55, metallic=0.2, tint=(0.95, 0.95, 0.93)),
            "painted_gray": tex_pbr("painted_gray", painted_c, painted_n, tile=1.5, roughness=0.6, metallic=0.2, tint=(0.55, 0.57, 0.58)),
            "painted_red": tex_pbr("painted_red", painted_c, painted_n, tile=1.0, roughness=0.55, metallic=0.1, tint=(0.75, 0.16, 0.12)),
            "painted_blue": tex_pbr("painted_blue", painted_c, painted_n, tile=1.0, roughness=0.55, metallic=0.1, tint=(0.2, 0.32, 0.6)),
            "painted_yellow": tex_pbr("painted_yellow", painted_c, painted_n, tile=1.0, roughness=0.55, metallic=0.1, tint=(0.9, 0.7, 0.15)),
            "painted_green": tex_pbr("painted_green", painted_c, painted_n, tile=1.0, roughness=0.6, metallic=0.1, tint=(0.3, 0.42, 0.3)),
            "led_farmacia": tex_pbr("led_farmacia", led_farm[0], tile=1.0, roughness=0.4, emissive_png=led_farm[1], emissive_strength=2.5, double_sided=True),
            "led_agua": tex_pbr("led_agua", led_agua[0], tile=1.0, roughness=0.4, emissive_png=led_agua[1], emissive_strength=2.2, double_sided=True),
            "warning": tex_pbr("warning", tex_stripes_warning(), tile=0.5, roughness=0.6),
            "screen_dead": pbr("screen_dead", color=(0.04, 0.05, 0.06), roughness=0.15),
            "lamp_dead": pbr("lamp_dead", color=(0.7, 0.7, 0.66), roughness=0.4),
            "lamp_cold": pbr("lamp_cold", color=(0.9, 0.95, 1.0), roughness=0.5, emissive=(0.8, 0.9, 1.0), emissive_strength=3.5),
            "grow_light": pbr("grow_light", color=(0.9, 0.7, 0.85), roughness=0.5, emissive=(1.0, 0.45, 0.8), emissive_strength=1.6),
            "camera_black": pbr("camera_black", color=(0.08, 0.08, 0.09), roughness=0.35),
            "battery": pbr("battery", color=(0.16, 0.2, 0.24), roughness=0.5, metallic=0.3),
            "aluminum": pbr("aluminum", color=(0.7, 0.72, 0.74), roughness=0.35, metallic=0.9),
            # remendos
            "tarp_blue": tex_pbr("tarp_blue", tex_tarp(), tile=1.0, roughness=0.8, double_sided=True),
            "clothes": tex_pbr("clothes", tex_clothes(), tile=1.0, roughness=0.95, alpha_mask=True, double_sided=True),
            "pvc_white": pbr("pvc_white", color=(0.85, 0.85, 0.8), roughness=0.5),
            "pvc_brown": pbr("pvc_brown", color=(0.4, 0.26, 0.16), roughness=0.6),
            "hose_green": pbr("hose_green", color=(0.2, 0.38, 0.2), roughness=0.7),
            "plastic_black": pbr("plastic_black", color=(0.03, 0.03, 0.03), roughness=0.45),
            "plastic_white": pbr("plastic_white", color=(0.9, 0.9, 0.86), roughness=0.5),
            "plastic_red": pbr("plastic_red", color=(0.7, 0.12, 0.1), roughness=0.5),
            "plastic_orange": pbr("plastic_orange", color=(0.95, 0.4, 0.05), roughness=0.55),
            "plastic_yellow": pbr("plastic_yellow", color=(0.9, 0.75, 0.1), roughness=0.5),
            "fibro": pbr("fibro", color=(0.6, 0.6, 0.56), roughness=0.95),
            # listras do toldo: reaproveita a textura de listras do kit da praça (já gerada por env.materials()), desbotada
            "stripes_faded": textured_plain("stripes_faded", os.path.join(env.GEN, "stripes.png"), tile=1.5, roughness=0.9, tint=(0.8, 0.78, 0.72), double_sided=True),
            # marcos
            "glass_broken": tex_pbr("glass_broken", tex_glass_broken(), tile=1.0, roughness=0.12, metallic=0.45, alpha_mask=True, double_sided=True),
            "cobogo": tex_pbr("cobogo", tex_cobogo(), tile=0.8, roughness=0.9, alpha_mask=True, double_sided=True),
            "crops": tex_pbr("crops", tex_crops(), tile=1.2, roughness=0.9),
            "soil": pbr("soil", color=(0.22, 0.17, 0.12), roughness=1.0),
            # props
            "lattice_yellow": tex_pbr("lattice_yellow", tex_lattice(), tile=1.0, roughness=0.5, tint=(0.9, 0.7, 0.1), alpha_mask=True, double_sided=True),
            "lattice_red": tex_pbr("lattice_red", tex_lattice(), tile=1.0, roughness=0.5, tint=(0.75, 0.15, 0.1), alpha_mask=True, double_sided=True),
            "pegboard": tex_pbr("pegboard", tex_pegboard(), tile=1.0, roughness=0.6, alpha_mask=True),
            "placa_setor": tex_pbr("placa_setor", tex_plate("setor", ["SETOR 17", "QUADRA 03"], (28, 60, 130, 255), (240, 240, 235, 255)), tile=1.0, roughness=0.4, metallic=0.3),
            "placa_numero": tex_pbr("placa_numero", tex_plate("numero", ["117"], (235, 232, 220, 255), (30, 30, 40, 255), size=(256, 256), font_px=120), tile=1.0, roughness=0.5),
            "placa_oficina": tex_pbr("placa_oficina", tex_plate("oficina", ["OFICINA", "SOLDA · BATERIAS"], (240, 200, 60, 255), (40, 30, 20, 255), font_px=60), tile=1.0, roughness=0.7),
            "placa_central": tex_pbr("placa_central", tex_plate("central", ["POSTO DE RECARGA", "CENTRAL DE SUPRIMENTOS"], (245, 245, 240, 255), (40, 60, 120, 255), font_px=38), tile=1.0, roughness=0.4),
            "glass_bottle": pbr("glass_bottle", color=(0.35, 0.2, 0.08), roughness=0.1),
            "poster": tex_pbr("poster", tex_poster(), tile=1.0, roughness=0.95),
            "wood_fine": textured_plain("wood_fine", os.path.join(env.GEN, "wood.png"), tile=0.45, roughness=0.7, tint=(0.9, 0.85, 0.8)),
            "sand": pbr("sand", color=(0.72, 0.62, 0.45), roughness=1.0),
            "leather": pbr("leather", color=(0.25, 0.16, 0.1), roughness=0.7),
        }
    )
    return M


# ---------------------------------------------------------------------------
# Primitivas extras
# ---------------------------------------------------------------------------
def _mesh_obj(name: str, bm: bmesh.types.BMesh, mat, loc=(0, 0, 0), rot=(0, 0, 0), smooth=False) -> bpy.types.Object:
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    if smooth:
        for p in obj.data.polygons:
            p.use_smooth = True
    return env._link(obj)


def polytube(name: str, pts, radius: float, mat, sides: int = 6, cap: bool = False, loc=(0, 0, 0), radius_end: float | None = None) -> bpy.types.Object:
    """Tubo contínuo ao longo de uma polilinha (fios, canos, mangueiras, quadros tubulares)."""
    pts = [Vector(p) for p in pts]
    bm = bmesh.new()
    rings = []
    prev_n = None
    n_pts = len(pts)
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n_pts - 1)] - pts[max(i - 1, 0)])
        t = t.normalized() if t.length > 1e-9 else Vector((0, 0, 1))
        if prev_n is None:
            a = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            n = (a - t * a.dot(t)).normalized()
        else:
            n = (prev_n - t * prev_n.dot(t))
            n = n.normalized() if n.length > 1e-9 else prev_n
        b = t.cross(n)
        r = radius if radius_end is None else radius + (radius_end - radius) * i / max(1, n_pts - 1)
        rings.append([bm.verts.new(p + (n * math.cos(k * TAU / sides) + b * math.sin(k * TAU / sides)) * r) for k in range(sides)])
        prev_n = n
    for i in range(len(rings) - 1):
        for k in range(sides):
            bm.faces.new((rings[i][k], rings[i][(k + 1) % sides], rings[i + 1][(k + 1) % sides], rings[i + 1][k]))
    if cap:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    return _mesh_obj(name, bm, mat, loc, smooth=True)


def catenary(p0, p1, sag: float, n: int = 12, side: float = 0.0):
    """Pontos de um cabo pendurado entre p0 e p1 (parábola), com desvio lateral opcional."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    perp = Vector((-d.y, d.x, 0)).normalized() if d.xy.length > 1e-6 else Vector((1, 0, 0))
    pts = []
    for i in range(n + 1):
        t = i / n
        pts.append(p0 + d * t + Vector((0, 0, -sag * 4 * t * (1 - t))) + perp * (side * math.sin(t * math.pi)))
    return pts


def lathe(name: str, profile, mat, segments: int = 16, loc=(0, 0, 0), rot=(0, 0, 0), smooth=True) -> bpy.types.Object:
    """Sólido de revolução a partir de um perfil [(raio, z), ...] (tanques, cones, garrafas, hidrante)."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), dvec=(0, 0, 0), angle=TAU, steps=segments, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    return _mesh_obj(name, bm, mat, loc, rot, smooth=smooth)


def prism(name: str, pts2d, depth: float, mat, axis: str = "x", loc=(0, 0, 0), rot=(0, 0, 0)) -> bpy.types.Object:
    """Prisma: polígono 2D extrudado ao longo de `axis` (centrado). axis x → pontos (y,z); y → (x,z); z → (x,y)."""

    def to3(a, b, c):
        return {"x": (c, a, b), "y": (a, c, b), "z": (a, b, c)}[axis]

    bm = bmesh.new()
    verts = [bm.verts.new(to3(a, b, -depth / 2)) for a, b in pts2d]
    f = bm.faces.new(verts)
    res = bmesh.ops.extrude_face_region(bm, geom=[f])
    moved = [g for g in res["geom"] if isinstance(g, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=to3(0, 0, depth), verts=moved)
    return _mesh_obj(name, bm, mat, loc, rot)


def plane(name: str, w: float, h: float, loc, mat, rot=(0, 0, 0), rect=(0, 0, 1, 1), double=False) -> bpy.types.Object:
    """Plano w×h (no plano XZ, normal -Y antes da rotação) com UV ajustado ao retângulo `rect` da textura."""
    bm = bmesh.new()
    v = [bm.verts.new((-w / 2, 0, -h / 2)), bm.verts.new((w / 2, 0, -h / 2)), bm.verts.new((w / 2, 0, h / 2)), bm.verts.new((-w / 2, 0, h / 2))]
    f = bm.faces.new(v)
    uv = bm.loops.layers.uv.verify()
    u0, v0, u1, v1 = rect
    coords = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
    for loop, c in zip(f.loops, coords):
        loop[uv].uv = c
    f.normal_update()
    if f.normal.y > 0:
        bm.faces.reverse()  # garante normal -Y
    o = _mesh_obj(name, bm, mat, loc, rot)
    o["keep_uv"] = True
    return o


def fit_uv(obj: bpy.types.Object, rect=(0, 0, 1, 1)) -> bpy.types.Object:
    """UV ajustado à caixa local do objeto (as duas maiores dimensões) → textura inteira (ou `rect`) numa face."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv = bm.loops.layers.uv.verify()
    lo = Vector((min(v.co.x for v in bm.verts), min(v.co.y for v in bm.verts), min(v.co.z for v in bm.verts)))
    hi = Vector((max(v.co.x for v in bm.verts), max(v.co.y for v in bm.verts), max(v.co.z for v in bm.verts)))
    ext = hi - lo
    axes = sorted(range(3), key=lambda i: -ext[i])[:2]
    a, b = sorted(axes)
    u0, v0, u1, v1 = rect
    for f in bm.faces:
        for loop in f.loops:
            p = loop.vert.co
            u = (p[a] - lo[a]) / max(ext[a], 1e-6)
            v = (p[b] - lo[b]) / max(ext[b], 1e-6)
            loop[uv].uv = (u0 + u * (u1 - u0), v0 + v * (v1 - v0))
    bm.to_mesh(obj.data)
    bm.free()
    obj["keep_uv"] = True
    return obj


def collider(name: str, size, loc, rot=(0, 0, 0)) -> bpy.types.Object:
    m = env._mats.get("collider") or pbr("collider", color=(1, 0, 1), roughness=1)
    return box(f"COL_{name}", size, loc, m, rot)


def tri_count(root: bpy.types.Object) -> int:
    return sum(len(p.vertices) - 2 for o in root.children_recursive if o.type == "MESH" and not o.name.startswith("COL_") for p in o.data.polygons)


def finish(objs, root_name: str, smooth=True) -> bpy.types.Object:
    """Como env.finish, mas respeita UVs ajustados (`keep_uv`) e junta por material."""
    root = bpy.data.objects.new(root_name, None)
    bpy.context.scene.collection.objects.link(root)
    by_mat: dict[str, list[bpy.types.Object]] = {}
    for o in objs:
        apply_modifiers(o)
        if not o.name.startswith("COL_"):
            if not o.get("keep_uv"):
                box_uv(o)
            if smooth:
                smooth_by_angle(o)
        key = o.data.materials[0].name if o.data.materials else "none"
        if o.name.startswith("COL_"):
            key = "COL:" + o.name
        by_mat.setdefault(key, []).append(o)
    for key, group in by_mat.items():
        if len(group) > 1 and not key.startswith("COL:"):
            with bpy.context.temp_override(object=group[0], active_object=group[0], selected_objects=group, selected_editable_objects=group):
                bpy.ops.object.join()
        obj = group[0]
        if not key.startswith("COL:"):
            obj.name = f"{root_name}_{key}"
        obj.parent = root
    return root


def P():
    return len(env._parts)


def parts_from(start):
    return env._parts[start:]


def stain(name, w, h, loc, M, rot=(math.pi / 2, 0, 0)):
    """Escorrido/infiltração (plano alpha) colado a 4 mm da parede."""
    return wavy_plane(name, w, h, loc, M["stain"], rot=rot, nx=2, ny=2, amp=0)


# ---------------------------------------------------------------------------
# FACHADAS — módulos de 6 m × 3 m (1 pavimento), parede de 50 cm com vãos reais
# ---------------------------------------------------------------------------
def wall_with_openings(plaster, openings, W=MOD_W, H=FLOOR_H, D=WALL_D, bevel=0.012):
    """Parede do módulo com vãos recortados (boolean) — (x, z0, largura, altura) por vão — e chanfro fino."""
    wall = box("parede", (W, D, H), (0, D / 2, H / 2), plaster)
    cutters = [box(f"cut_{i}", (w, D + 1.0, h), (x, D / 2, z0 + h / 2), plaster) for i, (x, z0, w, h) in enumerate(openings)]
    if cutters:
        cut(wall, cutters)
    bev = wall.modifiers.new("bevel", "BEVEL")
    bev.width = bevel
    bev.segments = 2
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(40)
    return wall


def window(M, x, z0, w, h, idx, glass="dark", bars=False, sill=True, shutter=False, boarded=False, depth=0.34, frame=None, double_leaf=True):
    """Janela encaixada no vão: peitoril saliente, caixilho fino, vidro recuado `depth`, grade opcional,
    persiana meio fechada ou tábuas. Vão: centro x, base z0, largura w, altura h."""
    fr = frame or M["metal_dark"]
    t = 0.05
    if sill:
        box(f"peitoril_{idx}", (w + 0.2, 0.42, 0.07), (x, 0.09, z0 - 0.035), M["concrete"], bevel=0.008, segments=1)
    box(f"cx_e_{idx}", (t, 0.07, h), (x - w / 2 + t / 2, depth, z0 + h / 2), fr)
    box(f"cx_d_{idx}", (t, 0.07, h), (x + w / 2 - t / 2, depth, z0 + h / 2), fr)
    box(f"cx_t_{idx}", (w, 0.07, t), (x, depth, z0 + h - t / 2), fr)
    box(f"cx_b_{idx}", (w, 0.07, t), (x, depth, z0 + t / 2), fr)
    if double_leaf:
        box(f"cx_m_{idx}", (t * 0.8, 0.07, h), (x, depth, z0 + h / 2), fr)
    if boarded:
        for k in range(3):
            box(f"tabua_{idx}_{k}", (w + 0.1, 0.045, 0.2), (x, depth - 0.05, z0 + 0.22 + k * (h - 0.44) / 2), M["wood"], rot=(0, (k - 1) * 0.07, 0))
    else:
        gm = {"dark": M["glass_dark"], "lit": M["glass_lit"], "frosted": M["plastic_white"], "broken": M["glass_broken"]}[glass]
        g = box(f"vidro_{idx}", (w - 0.08, 0.02, h - 0.08), (x, depth + 0.03, z0 + h / 2), gm)
        if glass == "broken":
            fit_uv(g, (0.5, 0.0, 1.0, 0.5))
    if shutter:
        # persiana de enrolar meio descida: caixa + lâminas
        box(f"persiana_cx_{idx}", (w, 0.12, 0.14), (x, depth - 0.04, z0 + h - 0.07), M["plastic_white"], bevel=0.01, segments=1)
        for k in range(6):
            box(f"persiana_{idx}_{k}", (w - 0.06, 0.02, 0.07), (x, depth - 0.02, z0 + h - 0.18 - k * 0.075), M["plastic_white"])
    if bars:
        n = max(3, int(w / 0.22))
        for k in range(n):
            cylinder(f"grade_{idx}_{k}", 0.011, h - 0.04, (x - w / 2 + (k + 1) * w / (n + 1), 0.16, z0 + h / 2), fr, segments=6, cap=False)
        box(f"grade_h_{idx}", (w, 0.022, 0.022), (x, 0.16, z0 + h * 0.5), fr)
    stain(f"mancha_{idx}", w, 0.7, (x, -0.004, z0 - 0.42), M)


def door(M, x, z0, w, h, idx, kind="wood", depth=0.38, step=True):
    """Porta embutida no vão com batente, folha, maçaneta e degrau."""
    fr = M["concrete"] if kind == "wood" else M["metal_dark"]
    box(f"batente_e_{idx}", (0.08, 0.14, h), (x - w / 2 + 0.04, depth - 0.02, z0 + h / 2), fr)
    box(f"batente_d_{idx}", (0.08, 0.14, h), (x + w / 2 - 0.04, depth - 0.02, z0 + h / 2), fr)
    box(f"verga_{idx}", (w, 0.14, 0.08), (x, depth - 0.02, z0 + h - 0.04), fr)
    leaf = M["wood_fine"] if kind == "wood" else M["painted_gray"]
    box(f"porta_{idx}", (w - 0.16, 0.05, h - 0.1), (x, depth + 0.03, z0 + (h - 0.1) / 2), leaf, bevel=0.006, segments=1)
    if kind == "wood":
        for k in range(2):
            box(f"almofada_{idx}_{k}", (w - 0.4, 0.015, (h - 0.5) / 2 - 0.1), (x, depth + 0.0, z0 + 0.3 + (h - 0.5) / 4 + k * ((h - 0.5) / 2)), leaf)
    cylinder(f"macaneta_{idx}", 0.016, 0.1, (x + w / 2 - 0.25, depth - 0.02, z0 + 1.0), M["metal_light"], segments=8, rot=(math.pi / 2, 0, 0))
    if step:
        box(f"degrau_{idx}", (w + 0.3, 0.45, z0 + 0.02), (x, -0.22, (z0 + 0.02) / 2), M["concrete_dark"], bevel=0.01, segments=1)


def laje_band(M, W=MOD_W):
    """Linha de laje na base do módulo (pavimentos superiores): saliência de 10 cm."""
    box("laje", (W + 0.1, 0.62, 0.14), (0, 0.2, 0.07), M["concrete"], bevel=0.012, segments=1)


def facade_collider(name, W=MOD_W, H=FLOOR_H):
    collider(name, (W, WALL_D + 0.1, H), (0, 0.2, H / 2))


def fachada_terreo_loja(M, v: int) -> bpy.types.Object:
    """Térreo comercial: vão de loja com porta de aço enrolar, porta de serviço embutida, faixa de letreiro
    e marquise de concreto sobre mísulas; embasamento em pedra escura."""
    s = P()
    plaster = [M["plaster_sand"], M["plaster_blue"]][v]
    shop = (0.7, 0.12, 3.4, 2.3)
    dr = (-2.05, 0.12, 1.0, 2.3)
    wall_with_openings(plaster, [shop, dr])
    # embasamento (três trechos entre os vãos)
    for x0, x1 in ((-3.0, -2.6), (-1.5, -1.05), (2.45, 3.0)):
        box(f"embasamento_{x0}", (x1 - x0, 0.56, 0.9), ((x0 + x1) / 2, 0.25, 0.45), M["tile_dark"], bevel=0.01, segments=1)
    # porta de enrolar (chapa com nervuras), trilhos e cadeado
    sx, sz, sw, sh = shop
    box("enrolar_chapa", (sw - 0.1, 0.04, sh - 0.3), (sx, 0.32, sz + (sh - 0.3) / 2), M["painted_gray"])
    for k in range(9):
        box(f"enrolar_nervura_{k}", (sw - 0.1, 0.03, 0.05), (sx, 0.295, sz + 0.25 + k * 0.22), M["metal_dark"])
    for side in (-1, 1):
        box(f"enrolar_trilho_{side}", (0.08, 0.12, sh), (sx + side * (sw / 2 - 0.04), 0.3, sz + sh / 2), M["metal_dark"])
    box("enrolar_caixa", (sw, 0.3, 0.3), (sx, 0.25, sz + sh - 0.15), M["painted_gray"], bevel=0.01, segments=1)
    box("enrolar_barra", (sw - 0.1, 0.06, 0.08), (sx, 0.3, sz + 0.06), M["metal_dark"])
    box("cadeado", (0.06, 0.03, 0.08), (sx + 1.2, 0.27, sz + 0.14), M["metal_light"])
    # faixa de letreiro antigo (pintura desbotada) e marquise com mísulas
    pl = plane("letreiro_faixa", sw + 0.2, 0.42, (sx, -0.03, 2.66), M["placa_oficina"] if v == 0 else M["placa_central"])
    box("letreiro_borda", (sw + 0.3, 0.05, 0.5), (sx, 0.0, 2.66), M["metal_dark"])
    box("marquise", (MOD_W, 1.1, 0.16), (0, -0.55, 2.9), M["concrete"], bevel=0.02, segments=1)
    for x in (-2.6, 0.0, 2.6):
        prism(f"misula_{x}", [(0.0, 2.82), (-0.9, 2.82), (0.0, 2.3)], 0.14, M["concrete"], axis="x", loc=(x, 0, 0))
    door(M, dr[0], dr[1], dr[2], dr[3], "serv", kind="steel")
    stain("mancha_marquise", 4.0, 0.5, (0.5, -0.004, 2.5), M)
    stain("mancha_base", 1.8, 0.9, (-2.8, -0.004, 1.3), M)
    plane("cartaz", 0.42, 0.6, (-2.78, -0.008, 1.75), M["poster"], rect=(0, 0, 0.5, 1) if v == 0 else (0.5, 0, 1, 1), rot=(0, 0.04, 0))
    cylinder("cabo", 0.01, MOD_W - 0.4, (0, -0.06, 2.75), M["rubber"], segments=5, rot=(0, math.pi / 2, 0), cap=False)
    facade_collider("loja")
    collider("degrau_loja", (1.3, 0.5, 0.14), (dr[0], -0.22, 0.07))
    return finish(parts_from(s), f"FACHADA_terreo_loja_{v}")


def fachada_terreo_casa(M, v: int) -> bpy.types.Object:
    """Térreo residencial: porta de madeira embutida com degrau e número, duas janelas gradeadas
    (uma com veneziana), rodapé de pedra, caixa de medidor e cabo de entrada."""
    s = P()
    plaster = [M["plaster_warm"], M["plaster_rose"]][v]
    dr = (-1.8, 0.12, 1.0, 2.2)
    w1 = (0.55, 1.1, 1.3, 1.2)
    w2 = (2.2, 1.1, 0.95, 1.2)
    wall_with_openings(plaster, [dr, w1, w2])
    for x0, x1 in ((-3.0, -2.35), (-1.25, 3.0)):
        box(f"rodape_{x0}", (x1 - x0, 0.56, 0.55), ((x0 + x1) / 2, 0.25, 0.275), M["tile_dark"], bevel=0.01, segments=1)
    door(M, *dr, "casa", kind="wood")
    plane("numero", 0.2, 0.2, (dr[0] + 0.75, -0.012, 2.05), M["placa_numero"])
    window(M, *w1, "c1", glass="dark", bars=True)
    window(M, *w2, "c2", glass="dark", bars=True, shutter=(v == 1), double_leaf=False)
    # caixa do medidor com visor e eletroduto, campainha, cabo de entrada aéreo
    box("medidor", (0.32, 0.16, 0.42), (-2.7, -0.08, 1.6), M["painted_gray"], bevel=0.008, segments=1)
    box("medidor_visor", (0.14, 0.01, 0.1), (-2.7, -0.165, 1.68), M["glass_dark"])
    polytube("eletroduto", [(-2.7, -0.08, 1.81), (-2.7, -0.08, 2.9), (-2.7, 0.0, 3.0)], 0.02, M["pvc_white"], sides=6)
    box("campainha", (0.06, 0.03, 0.08), (dr[0] + 0.7, -0.015, 1.4), M["plastic_white"])
    polytube("cabo_entrada", catenary((-2.7, -0.1, 2.9), (3.0, -0.08, 2.6), 0.15, 6), 0.01, M["rubber"], sides=5)
    stain("mancha_casa", 1.6, 0.8, (2.0, -0.004, 0.75), M)
    facade_collider("casa")
    collider("degrau_casa", (1.3, 0.5, 0.14), (dr[0], -0.22, 0.07))
    return finish(parts_from(s), f"FACHADA_terreo_casa_{v}")


def fachada_apto_janelas(M, v: int) -> bpy.types.Object:
    """Pavimento de apartamentos: linha de laje, três janelas rebaixadas (uma com persiana, uma acesa),
    frisos verticais nas extremidades e ar-condicionado embutido sob uma janela."""
    s = P()
    plaster = [M["plaster_sand"], M["plaster_green"]][v]
    ws = [(-2.0, 0.9, 1.3, 1.4), (0.0, 0.9, 1.3, 1.4), (2.0, 0.9, 1.3, 1.4)]
    wall_with_openings(plaster, ws)
    laje_band(M)
    window(M, *ws[0], "j0", glass="dark", shutter=True)
    window(M, *ws[1], "j1", glass="lit" if v == 0 else "dark")
    window(M, *ws[2], "j2", glass="dark" if v == 0 else "lit")
    for x in (-2.95, 2.95):
        box(f"friso_{x}", (0.1, 0.06, FLOOR_H - 0.14), (x, -0.03, 0.14 + (FLOOR_H - 0.14) / 2), M["concrete"])
    # ar-condicionado de janela encaixado sob a janela do meio
    ax = 0.0 if v == 0 else 2.0
    box("ac", (0.66, 0.5, 0.42), (ax, -0.18, 0.53), M["metal_light"], bevel=0.012, segments=1)
    for k in range(4):
        box(f"ac_grelha_{k}", (0.52, 0.02, 0.03), (ax, -0.44, 0.4 + k * 0.08), M["metal_dark"])
    box("ac_suporte", (0.56, 0.44, 0.03), (ax, -0.18, 0.31), M["rust_dark"])
    stain("mancha_ac", 0.6, 0.3, (ax, -0.004, 0.2), M)
    facade_collider("apto")
    return finish(parts_from(s), f"FACHADA_apto_janelas_{v}")


def fachada_apto_sacada(M, v: int) -> bpy.types.Object:
    """Pavimento com sacada: porta-janela de duas folhas, laje da varanda em balanço (1,1 m) com grade de
    barras, vaso com planta e toalha sobre o guarda-corpo; janela lateral com peitoril."""
    s = P()
    plaster = [M["plaster_warm"], M["plaster_blue"]][v]
    pj = (-0.9, 0.14, 1.6, 2.2)
    wj = (1.95, 0.9, 1.2, 1.3)
    wall_with_openings(plaster, [pj, wj])
    laje_band(M)
    # porta-janela (vidro + caixilho), sem peitoril
    window(M, *pj, "pj", glass="lit" if v == 1 else "dark", sill=False, depth=0.36)
    window(M, *wj, "wj", glass="dark")
    # varanda: laje em balanço, guarda-corpo de barras
    bx, bw, bd = -0.9, 3.0, 1.1
    box("varanda_laje", (bw, bd, 0.14), (bx, -bd / 2, 0.07), M["concrete"], bevel=0.012, segments=1)
    rail = M["metal_dark"] if v == 0 else M["painted_white"]
    for z in (1.05, 0.5):
        box(f"gc_frente_{z}", (bw, 0.035, 0.035), (bx, -bd + 0.05, z), rail)
    for side in (-1, 1):
        for z in (1.05, 0.5):
            box(f"gc_lado_{side}_{z}", (0.035, bd - 0.05, 0.035), (bx + side * (bw / 2 - 0.02), -bd / 2 + 0.0, z), rail)
        for k in range(3):
            cylinder(f"gc_lado_b_{side}_{k}", 0.011, 0.92, (bx + side * (bw / 2 - 0.02), -0.25 - k * 0.27, 0.6), rail, segments=6, cap=False)
    for k in range(12):
        cylinder(f"gc_barra_{k}", 0.011, 0.92, (bx - bw / 2 + 0.12 + k * (bw - 0.24) / 11, -bd + 0.05, 0.6), rail, segments=6, cap=False)
    # vaso com planta e toalha pendurada na grade
    lathe("vaso", [(0.0, 0.14), (0.16, 0.14), (0.2, 0.55), (0.17, 0.55), (0.14, 0.2), (0.0, 0.2)], M["produce_brown"], segments=10, loc=(bx + 1.1, -0.75, 0))
    for j in range(2):
        wavy_plane(f"vaso_folhas_{j}", 0.7, 0.6, (bx + 1.1, -0.75, 0.85), M["leaves"], rot=(math.pi / 2, 0, j * math.pi / 2 + 0.4), nx=2, ny=2, amp=0.03, freq=2)
    plane("toalha_frente", 0.6, 0.5, (bx - 0.9, -bd + 0.02, 0.8), M["clothes"], rect=(0, 0, 0.5, 0.5))
    plane("toalha_tras", 0.6, 0.45, (bx - 0.9, -bd + 0.08, 0.82), M["clothes"], rect=(0, 0, 0.5, 0.5), rot=(0, 0, math.pi))
    stain("mancha_varanda", 2.6, 0.5, (bx, -0.004, 0.3), M)
    stain("mancha_wj", 1.2, 0.6, (wj[0], -0.004, 0.5), M)
    facade_collider("sacada")
    collider("varanda", (bw, bd, 0.16), (bx, -bd / 2, 0.08))
    return finish(parts_from(s), f"FACHADA_apto_sacada_{v}")


def fachada_apto_servico(M, v: int) -> bpy.types.Object:
    """Área de serviço brasileira: cobogó vazado (duas camadas, alpha), janelinhas gradeadas com vidro
    fosco, prumadas de PVC aparentes, aquecedor a gás com chaminé e tanque de lavar visível no vão."""
    s = P()
    plaster = [M["plaster_gray"], M["plaster_sand"]][v]
    cob = (-1.5, 0.8, 2.2, 1.5)
    w1 = (0.95, 1.3, 0.7, 0.9)
    w2 = (2.2, 1.3, 0.7, 0.9)
    wall_with_openings(plaster, [cob, w1, w2])
    laje_band(M)
    # cobogó em duas camadas para dar profundidade; tanque (caixa) atrás
    for k, y in enumerate((0.2, 0.38)):
        pl = plane(f"cobogo_{k}", cob[2], cob[3], (cob[0], y, cob[1] + cob[3] / 2), M["cobogo"], rect=(0, 0, cob[2] / 0.55, cob[3] / 0.55))
    box("cobogo_peitoril", (cob[2] + 0.2, 0.42, 0.07), (cob[0], 0.09, cob[1] - 0.035), M["concrete"], bevel=0.008, segments=1)
    box("tanque", (0.6, 0.5, 0.3), (cob[0] + 0.6, 0.65, cob[1] + 0.2), M["plastic_white"], bevel=0.01, segments=1)
    window(M, *w1, "s1", glass="frosted", bars=True, double_leaf=False)
    window(M, *w2, "s2", glass="frosted", bars=True, double_leaf=False)
    # prumadas: esgoto marrom e água branca, com braçadeiras
    polytube("prumada_esgoto", [(-2.75, -0.1, 0.0), (-2.75, -0.1, 3.0)], 0.05, M["pvc_brown"], sides=8)
    polytube("prumada_agua", [(2.78, -0.08, 0.0), (2.78, -0.08, 1.9), (2.55, -0.08, 2.05), (2.55, -0.08, 3.0)], 0.025, M["pvc_white"], sides=6)
    for z in (0.6, 2.4):
        box(f"bracadeira_{z}", (0.16, 0.16, 0.05), (-2.75, -0.04, z), M["metal_dark"])
    # aquecedor a gás com chaminé
    box("aquecedor", (0.34, 0.2, 0.6), (-0.2, -0.1, 2.3), M["painted_white"], bevel=0.008, segments=1)
    polytube("chamine", [(-0.2, -0.1, 2.6), (-0.2, -0.1, 2.85), (-0.2, 0.05, 3.0)], 0.045, M["aluminum"], sides=8)
    polytube("gas", [(-0.2, -0.1, 2.0), (-0.2, -0.1, 1.2), (-0.5, -0.1, 1.2), (-0.5, -0.1, 0.0)], 0.012, M["painted_yellow"], sides=5)
    stain("mancha_cobogo", 2.2, 0.7, (cob[0], -0.004, 0.45), M)
    stain("mancha_esgoto", 0.5, 1.6, (-2.75, -0.004, 1.2), M)
    facade_collider("servico")
    return finish(parts_from(s), f"FACHADA_apto_servico_{v}")


def fachada_galpao(M, v: int) -> bpy.types.Object:
    """Galpão/oficina: painel de concreto nervurado (v0) ou reboco com frisos (v1), pilastras, verga de aço,
    janela alta em fita com um vidro quebrado, veneziana de ventilação e placa pintada."""
    s = P()
    panel = [M["concrete_ribbed"], M["plaster_gray"]][v]
    cl = (0.0, 2.1, 5.0, 0.6)
    wall_with_openings(panel, [cl])
    box("embasamento", (MOD_W + 0.1, 0.56, 0.4), (0, 0.25, 0.2), M["concrete_dark"], bevel=0.01, segments=1)
    for x in (-2.85, 2.85):
        box(f"pilastra_{x}", (0.3, 0.62, FLOOR_H), (x, 0.19, FLOOR_H / 2), M["concrete"], bevel=0.015, segments=1)
    if v == 0:
        for k in range(16):
            box(f"nervura_{k}", (0.09, 0.06, 1.6), (-2.4 + k * 0.32, -0.03, 1.2), M["concrete_ribbed"])
    else:
        for z in (0.9, 1.7):
            box(f"friso_{z}", (5.3, 0.06, 0.08), (0, -0.03, z), M["concrete"])
    box("verga", (5.3, 0.14, 0.12), (0, -0.04, 2.04), M["metal_dark"])
    # fita de janelas: 5 panos com montantes; um pano quebrado
    for k in range(5):
        x = -2.0 + k * 1.0
        g = box(f"fita_vidro_{k}", (0.92, 0.02, 0.5), (x, 0.3, 2.4), M["glass_broken"] if k == 3 else M["glass_dark"])
        if k == 3:
            fit_uv(g, (0.5, 0.0, 1.0, 0.5))
    for k in range(6):
        box(f"montante_{k}", (0.05, 0.08, 0.6), (-2.5 + k * 1.0, 0.3, 2.4), M["metal_dark"])
    box(f"fita_topo", (5.0, 0.08, 0.05), (0, 0.3, 2.68), M["metal_dark"])
    box(f"fita_base", (5.0, 0.08, 0.05), (0, 0.3, 2.12), M["metal_dark"])
    # veneziana de ventilação e placa
    box("veneziana_quadro", (1.0, 0.06, 0.6), (2.0, -0.03, 1.2), M["metal_dark"])
    for k in range(6):
        box(f"veneziana_{k}", (0.9, 0.02, 0.1), (2.0, -0.07, 0.95 + k * 0.1), M["metal_light"], rot=(math.radians(35), 0, 0))
    plane("placa", 1.6, 0.6, (-1.3, -0.07, 1.5), M["placa_oficina"] if v == 0 else M["placa_setor"])
    box("placa_borda", (1.7, 0.03, 0.7), (-1.3, -0.045, 1.5), M["metal_dark"])
    stain("mancha_galpao", 2.0, 1.2, (0.4, -0.065, 1.0), M)
    plane("cartaz_a", 0.42, 0.6, (0.3, -0.065, 1.2), M["poster"], rect=(0.5, 0, 1, 1), rot=(0, -0.05, 0))
    plane("cartaz_b", 0.42, 0.6, (0.75, -0.065, 1.15), M["poster"], rect=(0, 0, 0.5, 1), rot=(0, 0.03, 0))
    cylinder("cabo", 0.01, 5.0, (0, -0.1, 2.85), M["rubber"], segments=5, rot=(0, math.pi / 2, 0), cap=False)
    facade_collider("galpao")
    return finish(parts_from(s), f"FACHADA_galpao_{v}")


def fachada_esquina(M, v: int) -> bpy.types.Object:
    """Peça de esquina: coluna 0,7 × 0,7 × 3 m centrada na origem (cobre o encontro de dois módulos a 90°),
    com cunhal chanfrado, rodapé de pedra, friso alto e calha de descida com braçadeiras."""
    s = P()
    plaster = [M["plaster_warm"], M["plaster_green"]][v]
    box("coluna", (0.7, 0.7, FLOOR_H), (0, 0, FLOOR_H / 2), plaster, bevel=0.05, segments=2)
    box("rodape", (0.78, 0.78, 0.55), (0, 0, 0.275), M["tile_dark"], bevel=0.015, segments=1)
    box("friso", (0.8, 0.8, 0.08), (0, 0, 2.82), M["concrete"], bevel=0.01, segments=1)
    polytube("calha", [(0.28, -0.42, 0.0), (0.28, -0.42, 2.7), (0.28, -0.3, 3.0)], 0.05, M["rust"], sides=8)
    for z in (0.9, 2.2):
        box(f"bracadeira_{z}", (0.16, 0.14, 0.05), (0.28, -0.4, z), M["metal_dark"])
    stain("mancha_esquina", 0.5, 1.2, (0.1, -0.355, 1.3), M)
    if v == 1:
        plane("cartaz", 0.36, 0.5, (-0.1, -0.36, 1.6), M["poster"], rect=(0, 0, 0.5, 1), rot=(0, 0.02, 0))
    collider("esquina", (0.72, 0.72, FLOOR_H), (0, 0, FLOOR_H / 2))
    return finish(parts_from(s), f"FACHADA_esquina_{v}")


def fachada_topo(M, v: int) -> bpy.types.Object:
    """Peça de topo (coroamento) de 6 m: cornija saliente, platibanda com dois frisos e pingadeira, buzinotes
    de PVC com escorrido; v1 acrescenta telhado de telha ondulada e antena de TV."""
    s = P()
    plaster = [M["plaster_sand"], M["plaster_gray"]][v]
    box("cornija", (MOD_W + 0.2, 0.76, 0.16), (0, 0.12, 0.08), M["concrete"], bevel=0.03, segments=1)
    box("platibanda", (MOD_W, 0.5, 0.9), (0, 0.25, 0.16 + 0.45), plaster, bevel=0.012, segments=1)
    for z in (0.5, 0.86):
        box(f"friso_{z}", (MOD_W + 0.1, 0.56, 0.06), (0, 0.25, z), M["concrete"])
    box("pingadeira", (MOD_W + 0.2, 0.62, 0.08), (0, 0.25, 1.1), M["concrete"], bevel=0.012, segments=1)
    for x in (-2.2, 2.4):
        polytube(f"buzinote_{x}", [(x, 0.3, 0.32), (x, -0.3, 0.32)], 0.035, M["pvc_white"], sides=6, cap=True)
        stain(f"mancha_buzinote_{x}", 0.4, 0.5, (x, -0.004, 0.0), M, rot=(math.pi / 2, 0, 0))
    stain("mancha_topo", 3.0, 0.4, (0.5, -0.004, 0.75), M)
    if v == 1:
        roof = wavy_plane("telhado", MOD_W - 0.2, 2.2, (0, 1.5, 1.35), M["corrugated"], rot=(math.radians(10), 0, 0), nx=40, ny=2, amp=0, corrugate=0.012, corr_period=0.076)
        roof.modifiers.new("solid", "SOLIDIFY").thickness = 0.012
        for x in (-2.5, 0.0, 2.5):
            box(f"terca_{x}", (0.08, 2.0, 0.08), (x, 1.5, 1.12), M["wood"])
        polytube("antena_mastro", [(2.0, 1.2, 1.3), (2.0, 1.2, 3.2)], 0.015, M["aluminum"], sides=5)
        for k, z in enumerate((2.7, 2.9, 3.1)):
            polytube(f"antena_{k}", [(2.0 - 0.45 + k * 0.1, 1.2, z), (2.0 + 0.45 - k * 0.1, 1.2, z)], 0.008, M["aluminum"], sides=4)
    collider("topo", (MOD_W, 0.6, 1.14), (0, 0.25, 0.57))
    return finish(parts_from(s), f"FACHADA_topo_{v}")


# ---------------------------------------------------------------------------
# TECH — camada tecnológica 2043–2056, aparafusada por cima da base antiga
# ---------------------------------------------------------------------------
def pv_panel(M, name, w, h, loc, rot=(0, 0, 0), cracked=False, mat=None):
    """Um painel fotovoltaico (caixa fina com moldura de alumínio nas bordas) com a textura ajustada."""
    p = box(name, (w, 0.04, h), loc, mat or (M["pv_cracked"] if cracked else M["pv"]), rot=rot)
    fit_uv(p)
    return p


def tech_pele_fotovoltaica(M, torn: int) -> bpy.types.Object:
    """Pele fotovoltaica de fachada (6 × 3 m, encaixa na frente de um módulo): trilhos de alumínio
    afastados 45 cm da parede, 5 × 2 painéis; `torn`=1 arranca dois painéis e deixa um pendurado por um
    canto com o cabo à mostra. Origem na base, na linha da fachada (y=0)."""
    s = P()
    al = M["aluminum"]
    yf = -0.46
    for x in (-2.9, -0.0, 2.9):
        box(f"trilho_v_{x}", (0.06, 0.06, 2.9), (x, yf + 0.03, 1.5), al)
    for z in (0.12, 1.52, 2.9):
        box(f"trilho_h_{z}", (5.9, 0.05, 0.05), (0, yf + 0.03, z), al)
    for x in (-2.9, 0.0, 2.9):
        for z in (0.3, 2.75):
            box(f"suporte_{x}_{z}", (0.05, -yf - 0.02, 0.05), (x, (yf + 0.0) / 2 - 0.01, z), M["metal_dark"])
            box(f"chapa_{x}_{z}", (0.14, 0.02, 0.14), (x, -0.01, z), M["metal_dark"])
    pw, ph = 1.1, 1.36
    missing = {(1, 1), (3, 0)} if torn else set()
    hanging = (3, 1) if torn else None
    cracked = {(0, 0)} if torn else {(2, 1)}
    for i in range(5):
        for j in range(2):
            x = -2.32 + i * 1.16
            z = 0.84 + j * 1.42
            if (i, j) in missing:
                continue
            if (i, j) == hanging:
                pv_panel(M, f"painel_{i}_{j}", pw, ph, (x + 0.35, yf - 0.3, z - 0.5), rot=(math.radians(28), math.radians(-18), math.radians(12)))
                polytube(f"cabo_pendurado_{i}", [(x - 0.4, yf - 0.05, z + 0.6), (x - 0.3, yf - 0.2, z + 0.1), (x + 0.1, yf - 0.32, z - 0.1)], 0.01, M["rubber"], sides=5)
                continue
            pv_panel(M, f"painel_{i}_{j}", pw, ph, (x, yf - 0.03, z), cracked=(i, j) in cracked)
    # cabeamento: caixa de junção e cabos descendo por trás dos trilhos
    box("juncao", (0.3, 0.14, 0.22), (2.6, yf + 0.12, 0.5), M["painted_gray"], bevel=0.008, segments=1)
    polytube("cabo_tronco", [(2.6, yf + 0.14, 0.4), (2.6, yf + 0.14, 0.1), (2.9, -0.05, 0.05)], 0.014, M["rubber"], sides=5)
    polytube("cabo_h", [(-2.8, yf + 0.08, 0.1), (2.5, yf + 0.08, 0.1)], 0.01, M["rubber"], sides=5)
    if torn:
        stain("mancha_pele", 2.0, 1.0, (0.5, -0.004, 1.2), M)
    collider("pele", (6.0, 0.55, 3.0), (0, yf / 2, 1.5))
    return finish(parts_from(s), f"TECH_pele_fotovoltaica_{'rasgada' if torn else 'inteira'}")


def tech_canopy_solar(M) -> bpy.types.Object:
    """Dossel solar de cobertura (6 × 3 m, 1,2 m de altura): 4 montantes com mãos-francesas e 4 × 2
    painéis inclinados 10° — a 'caixa de painéis' no alto dos prédios da referência. Origem no piso da laje."""
    s = P()
    al = M["aluminum"]
    for x in (-2.7, 2.7):
        for y in (-1.3, 1.3):
            box(f"montante_{x}_{y}", (0.08, 0.08, 1.2), (x, y, 0.6), M["painted_gray"])
            box(f"base_{x}_{y}", (0.3, 0.3, 0.05), (x, y, 0.025), M["concrete_dark"])
    for y in (-1.3, 1.3):
        box(f"viga_{y}", (5.6, 0.08, 0.1), (0, y, 1.2 + (0.0 if y > 0 else 0.45)), M["painted_gray"])
    for x in (-2.7, 2.7):
        prism(f"viga_incl_{x}", [(-1.4, 1.65), (1.4, 1.2), (1.4, 1.3), (-1.4, 1.75)], 0.08, M["painted_gray"], axis="x", loc=(x, 0, 0))
        prism(f"mao_francesa_{x}", [(-1.3, 0.3), (-1.3, 1.1), (-0.5, 1.1)], 0.06, M["painted_gray"], axis="x", loc=(x, 0, 0))
    for i in range(4):
        for j in range(2):
            x = -2.1 + i * 1.4
            y = -0.7 + j * 1.4
            pv_panel(M, f"painel_{i}_{j}", 1.36, 1.36, (x, y, 1.56 - y * 0.16), rot=(math.radians(-9), 0, 0), cracked=(i, j) == (2, 0))
    box("inversor", (0.4, 0.2, 0.5), (2.6, 1.2, 0.5), M["painted_gray"], bevel=0.01, segments=1)
    polytube("cabo", [(2.6, 1.2, 0.75), (2.6, 1.25, 1.15), (0.0, 1.25, 1.18)], 0.012, M["rubber"], sides=5)
    collider("canopy", (6.0, 3.2, 1.8), (0, 0, 0.9))
    return finish(parts_from(s), "TECH_canopy_solar")


def tech_anexo_modular(M) -> bpy.types.Object:
    """Anexo habitacional pré-fabricado (6 × 2,5 × 2,8 m): corpo de chapa pintada sobre pés de aço,
    cantoneiras, janela e porta embutidas, ar-condicionado lateral, eletroduto, escorridos. Fica em lajes."""
    s = P()
    W, D, H = 6.0, 2.5, 2.8
    z0 = 0.3
    body = box("corpo", (W, D, H), (0, D / 2, z0 + H / 2), M["painted_white"])
    cutters = [box("cut_janela", (1.3, 1.0, 1.0), (-1.3, 0.2, z0 + 1.6), M["painted_white"]), box("cut_porta", (0.9, 1.0, 2.1), (1.8, 0.2, z0 + 1.08), M["painted_white"])]
    cut(body, cutters)
    bev = body.modifiers.new("bevel", "BEVEL")
    bev.width = 0.02
    bev.segments = 1
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(40)
    # nervuras verticais (chapa trapezoidal) na frente e no fundo
    for k in range(10):
        x = -2.7 + k * 0.6
        if -2.0 < x < -0.6 or 1.3 < x < 2.3:
            continue
        box(f"nervura_f_{k}", (0.12, 0.03, H - 0.5), (x, -0.015, z0 + H / 2), M["painted_white"])
    for k in range(10):
        box(f"nervura_t_{k}", (0.12, 0.03, H - 0.5), (-2.7 + k * 0.6, D + 0.015, z0 + H / 2), M["painted_white"])
    # cantoneiras, pés, cobertura com beiral
    for x in (-W / 2, W / 2):
        for y in (0, D):
            box(f"cantoneira_b_{x}_{y}", (0.2, 0.2, 0.25), (x, y, z0 + 0.125), M["metal_dark"])
            box(f"cantoneira_t_{x}_{y}", (0.2, 0.2, 0.25), (x, y, z0 + H - 0.125), M["metal_dark"])
            box(f"pe_{x}_{y}", (0.16, 0.16, z0), (x * 0.92, y * 0.9 + 0.1, z0 / 2), M["rust_dark"])
    box("cobertura", (W + 0.3, D + 0.3, 0.08), (0, D / 2, z0 + H + 0.04), M["painted_gray"], bevel=0.01, segments=1)
    box("calha_frente", (W + 0.3, 0.1, 0.1), (0, -0.1, z0 + H - 0.02), M["aluminum"])
    # janela (caixilho + vidro) e porta
    window(M, -1.3, z0 + 1.1, 1.3, 1.0, "anexo", glass="lit", sill=False, depth=0.14, frame=M["aluminum"])
    box("porta", (0.8, 0.05, 2.0), (1.8, 0.16, z0 + 1.03), M["painted_gray"], bevel=0.006, segments=1)
    box("porta_janela", (0.4, 0.02, 0.4), (1.8, 0.13, z0 + 1.6), M["glass_dark"])
    cylinder("macaneta", 0.015, 0.1, (2.1, 0.1, z0 + 1.0), M["metal_light"], segments=8, rot=(math.pi / 2, 0, 0))
    box("degrau", (1.0, 0.4, z0), (1.8, -0.2, z0 / 2), M["concrete_dark"], bevel=0.01, segments=1)
    # ar-condicionado na lateral, eletroduto, luminária sobre a porta, manchas
    box("ac", (0.4, 0.7, 0.5), (W / 2 + 0.2, 1.2, z0 + 1.0), M["metal_light"], bevel=0.012, segments=1)
    for k in range(4):
        box(f"ac_grelha_{k}", (0.02, 0.55, 0.03), (W / 2 + 0.41, 1.2, z0 + 0.85 + k * 0.08), M["metal_dark"])
    polytube("eletroduto", [(-2.95, -0.05, 0.0), (-2.95, -0.05, z0 + 2.3), (-2.5, -0.05, z0 + 2.3), (-2.5, 0.0, z0 + 2.3)], 0.02, M["pvc_white"], sides=6)
    box("luminaria", (0.3, 0.12, 0.08), (1.8, -0.06, z0 + 2.4), M["metal_dark"])
    box("luminaria_luz", (0.24, 0.1, 0.02), (1.8, -0.06, z0 + 2.35), M["lamp"])
    stain("mancha_anexo", 1.4, 0.9, (0.3, -0.004, z0 + 0.6), M)
    stain("mancha_anexo2", 0.8, 1.6, (2.75, -0.004, z0 + 1.6), M)
    collider("anexo", (W, D, H + z0), (0, D / 2, (H + z0) / 2))
    return finish(parts_from(s), "TECH_anexo_modular")


def tech_reciclador_agua(M) -> bpy.types.Object:
    """Reciclador de água de telhado: tanque horizontal sobre berços, duas colunas de filtro, bomba,
    tubulações, painel de controle com tela morta e mini painel solar. Origem na base."""
    s = P()
    tank = cylinder("tanque", 0.5, 1.7, (-0.5, 0, 0.95), M["painted_white"], segments=18, rot=(0, math.pi / 2, 0), bevel=0.06)
    for x in (-1.1, 0.1):
        prism(f"berco_{x}", [(-0.55, 0.0), (0.55, 0.0), (0.4, 0.5), (-0.4, 0.5)], 0.12, M["rust_dark"], axis="x", loc=(x, 0, 0))
    for k, x in enumerate((0.85, 1.25)):
        lathe(f"filtro_{k}", [(0, 0), (0.16, 0), (0.16, 1.3), (0.1, 1.42), (0, 1.42)], M["painted_blue"] if k == 0 else M["painted_gray"], segments=12, loc=(x, 0.3, 0))
        box(f"filtro_tampa_{k}", (0.2, 0.2, 0.06), (x, 0.3, 1.45), M["metal_dark"])
    box("bomba", (0.4, 0.3, 0.3), (0.9, -0.5, 0.15), M["painted_green"], bevel=0.01, segments=1)
    cylinder("bomba_motor", 0.12, 0.3, (1.05, -0.5, 0.3), M["metal_dark"], segments=12, rot=(0, math.pi / 2, 0))
    polytube("tubo_1", [(0.35, 0, 1.0), (0.6, 0, 1.0), (0.6, 0.3, 1.0), (0.85, 0.3, 1.0)], 0.03, M["pvc_white"], sides=8)
    polytube("tubo_2", [(0.85, 0.3, 1.55), (1.25, 0.3, 1.55)], 0.03, M["pvc_white"], sides=8)
    polytube("tubo_3", [(1.25, 0.3, 0.3), (1.25, -0.3, 0.3), (1.1, -0.5, 0.3)], 0.03, M["pvc_white"], sides=8)
    polytube("tubo_entrada", [(-1.3, 0.0, 1.45), (-1.3, 0.0, 1.9), (-1.3, 0.6, 2.1), (-0.3, 0.9, 2.1)], 0.04, M["pvc_white"], sides=8)
    polytube("mangueira", [(0.9, -0.65, 0.1), (0.4, -0.9, 0.05), (-0.3, -0.8, 0.05), (-0.8, -0.5, 0.05)], 0.018, M["hose_green"], sides=6)
    box("painel", (0.36, 0.1, 0.46), (-0.2, -0.6, 0.9), M["painted_gray"], bevel=0.008, segments=1)
    box("painel_tela", (0.22, 0.01, 0.14), (-0.2, -0.655, 0.98), M["screen_dead"])
    box("painel_poste", (0.06, 0.06, 0.7), (-0.2, -0.6, 0.35), M["metal_dark"])
    pv_panel(M, "mini_solar", 0.7, 0.5, (1.1, 0.1, 1.95), rot=(math.radians(-25), 0, 0))
    box("mini_solar_poste", (0.05, 0.05, 1.3), (1.1, 0.25, 1.25), M["aluminum"])
    cylinder("boia", 0.1, 0.2, (-0.5, 0, 1.52), M["metal_dark"], segments=10)
    stain("mancha_tanque", 0.6, 0.5, (-0.5, -0.5, 0.8), M)
    collider("reciclador", (2.9, 1.6, 1.7), (0.15, -0.15, 0.85))
    return finish(parts_from(s), "TECH_reciclador_agua")


def tech_poste_sensor(M) -> bpy.types.Object:
    """Poste-sensor (9 m): mastro afunilado, cruzeta com duas câmeras dome mortas e uma bullet, duas
    luminárias LED (uma acesa), antena, caixa de sensores, cabos e gancho de feira improvisado."""
    s = P()
    polytube("mastro", [(0, 0, 0), (0, 0, 9.0)], 0.14, M["painted_gray"], sides=12, radius_end=0.07)
    lathe("flange", [(0, 0), (0.32, 0), (0.32, 0.05), (0.18, 0.05), (0.18, 0.4), (0, 0.4)], M["metal_dark"], segments=12)
    box("cruzeta", (2.4, 0.1, 0.1), (0, 0, 7.6), M["painted_gray"])
    for x, lit in ((-1.1, True), (1.1, False)):
        box(f"luminaria_{x}", (0.5, 0.26, 0.1), (x, -0.15, 7.5), M["painted_gray"], bevel=0.01, segments=1)
        box(f"luminaria_luz_{x}", (0.42, 0.2, 0.02), (x, -0.15, 7.44), M["lamp_cold"] if lit else M["lamp_dead"])
    for x in (-0.6, 0.6):
        cylinder(f"dome_base_{x}", 0.11, 0.05, (x, -0.1, 7.52), M["painted_gray"], segments=12)
        sphere(f"dome_{x}", 0.09, (x, -0.1, 7.48), M["camera_black"], subdiv=1)
    box("bullet", (0.1, 0.3, 0.1), (0.0, -0.25, 8.2), M["camera_black"], bevel=0.01, segments=1, rot=(math.radians(15), 0, 0))
    box("bullet_suporte", (0.04, 0.2, 0.04), (0.0, -0.1, 8.1), M["metal_dark"])
    box("sensores", (0.3, 0.3, 0.5), (0, 0.22, 6.8), M["painted_gray"], bevel=0.01, segments=1)
    sphere("sensor_led", 0.02, (0.1, 0.06, 6.95), M["screen_dead"], subdiv=1)
    polytube("antena", [(0, 0, 9.0), (0, 0, 9.9)], 0.015, M["aluminum"], sides=5)
    polytube("antena_disco", [(0, 0.2, 8.6), (0, 0.45, 8.75)], 0.015, M["aluminum"], sides=5)
    cylinder("antena_prato", 0.22, 0.03, (0, 0.5, 8.78), M["painted_white"], segments=14, rot=(math.radians(60), 0, 0))
    polytube("cabos", [(0, 0.12, 7.4), (0.05, 0.14, 4.0), (0.0, 0.12, 1.2), (0, 0.12, 0.9)], 0.015, M["rubber"], sides=5)
    box("caixa_passagem", (0.26, 0.16, 0.36), (0, 0.18, 1.1), M["painted_gray"], bevel=0.008, segments=1)
    # reaproveitamento: gancho, corda e lona enrolada presa ao poste
    polytube("gancho", [(0.1, 0, 2.6), (0.4, 0, 2.6), (0.4, 0, 2.75)], 0.015, M["rust"], sides=5)
    polytube("corda", [(0.4, 0, 2.75), (0.4, -0.05, 2.0), (0.35, -0.1, 1.7)], 0.01, M["fabric_cream"], sides=5)
    cylinder("lona_enrolada", 0.07, 1.2, (-0.18, 0.05, 1.8), M["tarp_blue"], segments=8, bevel=0.0)
    for z in (1.5, 2.1):
        torus(f"cinta_{z}", 0.19, 0.012, (0, 0, z), M["fabric_olive"], seg_major=12, seg_minor=4)
    collider("poste", (0.3, 0.3, 9.0), (0, 0, 4.5))
    return finish(parts_from(s), "TECH_poste_sensor")


def tech_letreiro_led(M, kind: str) -> bpy.types.Object:
    """Letreiro LED fino em bandeira (0,12 × 0,7 × 2,4 m), perpendicular à fachada, com texto fictício
    emissivo nas duas faces e colunas de LED mortas; braços e cabo. Origem: base do letreiro, na parede."""
    s = P()
    mat = M["led_farmacia"] if kind == "farmacia" else M["led_agua"]
    box("caixa", (0.1, 0.7, 2.4), (0, -0.6, 1.2), M["metal_dark"], bevel=0.008, segments=1)
    for sx in (-1, 1):
        plane(f"face_{sx}", 0.64, 2.3, (sx * 0.052, -0.6, 1.2), mat, rot=(0, 0, sx * math.pi / 2))
    for z in (0.25, 2.15):
        box(f"braco_{z}", (0.05, 0.3, 0.05), (0, -0.15, z), M["metal_dark"])
        box(f"chapa_{z}", (0.14, 0.02, 0.14), (0, -0.01, z), M["metal_dark"])
    polytube("cabo", [(0.03, -0.3, 2.4), (0.02, -0.15, 2.5), (0.0, -0.02, 2.55)], 0.008, M["rubber"], sides=4)
    return finish(parts_from(s), f"TECH_letreiro_led_{kind}")


def tech_totem_recarga(M) -> bpy.types.Object:
    """Totem de recarga de veículos elétricos (1,7 m) reaproveitado como poste de feira: tela morta,
    cabo enrolado no gancho, corda amarrada, lousa de preços pendurada. Origem na base."""
    s = P()
    lathe("corpo", [(0, 0), (0.24, 0), (0.24, 0.1), (0.2, 0.1), (0.2, 1.5), (0.14, 1.68), (0, 1.7)], M["painted_white"], segments=14)
    box("tela_quadro", (0.3, 0.06, 0.3), (0, -0.19, 1.25), M["metal_dark"], bevel=0.008, segments=1, rot=(math.radians(-12), 0, 0))
    box("tela", (0.24, 0.01, 0.22), (0, -0.215, 1.26), M["screen_dead"], rot=(math.radians(-12), 0, 0))
    plane("placa", 0.34, 0.14, (0, -0.205, 0.95), M["placa_central"])
    box("gancho", (0.12, 0.1, 0.04), (0.2, -0.05, 1.0), M["metal_dark"])
    # cabo de recarga enrolado (espiral) e conector
    spiral = [(0.26 + 0.05 * math.cos(t), -0.05 + 0.05 * math.sin(t), 1.0 - 0.012 * t) for t in [i * 0.55 for i in range(26)]]
    polytube("cabo_enrolado", spiral, 0.018, M["rubber"], sides=5)
    box("conector", (0.08, 0.06, 0.16), (0.3, -0.05, 0.5), M["plastic_black"], bevel=0.008, segments=1)
    # corda amarrada e lousa de preços
    for z in (0.6, 0.66):
        torus(f"corda_{z}", 0.21, 0.01, (0, 0, z), M["fabric_cream"], seg_major=12, seg_minor=4)
    polytube("corda_solta", [(-0.2, -0.05, 0.63), (-0.6, -0.1, 0.4), (-0.9, -0.15, 0.0)], 0.01, M["fabric_cream"], sides=4)
    box("lousa", (0.3, 0.02, 0.4), (-0.05, -0.2, 0.55), M["metal_dark"], rot=(0, 0, 0.15))
    box("lousa_moldura", (0.33, 0.015, 0.43), (-0.05, -0.195, 0.55), M["wood"], rot=(0, 0, 0.15))
    collider("totem", (0.5, 0.5, 1.7), (0, 0, 0.85))
    return finish(parts_from(s), "TECH_totem_recarga")


def tech_caixa_baterias(M) -> bpy.types.Object:
    """Caixa de baterias externa (1,2 × 0,6 × 1,1 m): rack com 2 × 3 módulos, faixa de advertência,
    disjuntor externo, grelha de ventilação, chicote de cabos e luz de status. Origem na base."""
    s = P()
    box("base", (1.2, 0.6, 0.08), (0, 0, 0.04), M["metal_dark"], bevel=0.008, segments=1)
    for x in (-0.57, 0.57):
        for y in (-0.27, 0.27):
            box(f"montante_{x}_{y}", (0.05, 0.05, 1.0), (x, y, 0.58), M["metal_dark"])
    for z in (0.5, 0.98):
        box(f"prateleira_{z}", (1.18, 0.56, 0.03), (0, 0, z), M["metal_dark"])
    for j, z in enumerate((0.1, 0.53)):
        for i in range(3):
            box(f"modulo_{i}_{j}", (0.34, 0.5, 0.36), (-0.38 + i * 0.38, 0, z + 0.19), M["battery"], bevel=0.012, segments=1)
            box(f"modulo_alca_{i}_{j}", (0.12, 0.02, 0.04), (-0.38 + i * 0.38, -0.27, z + 0.3), M["metal_light"])
            sphere(f"led_{i}_{j}", 0.012, (-0.38 + i * 0.38 - 0.12, -0.26, z + 0.08), M["screen"] if (i + j) % 3 == 0 else M["screen_dead"], subdiv=1)
    fw = plane("faixa", 1.16, 0.08, (0, -0.305, 1.04), M["warning"], rect=(0, 0, 4, 0.3))
    box("disjuntor", (0.26, 0.12, 0.3), (0.65, 0.1, 0.75), M["painted_gray"], bevel=0.008, segments=1)
    box("disjuntor_alavanca", (0.04, 0.06, 0.1), (0.72, 0.1, 0.75), M["plastic_red"])
    for k in range(5):
        box(f"grelha_{k}", (0.3, 0.02, 0.025), (0.0, 0.3, 0.3 + k * 0.05), M["metal_light"])
    polytube("chicote", [(0.65, 0.1, 0.9), (0.65, 0.2, 1.0), (0.3, 0.32, 1.02), (-0.5, 0.32, 1.02), (-0.6, 0.32, 0.6), (-0.6, 0.35, 0.0)], 0.018, M["rubber"], sides=5)
    polytube("cabo_saida", [(0.65, 0.1, 0.6), (0.7, 0.1, 0.3), (0.8, 0.2, 0.0)], 0.014, M["plastic_orange"], sides=5)
    collider("baterias", (1.3, 0.7, 1.1), (0, 0, 0.55))
    return finish(parts_from(s), "TECH_caixa_baterias")


EXTRA_BUILDERS_TECH = {
    "TECH_pele_fotovoltaica_inteira": lambda M: tech_pele_fotovoltaica(M, 0),
    "TECH_pele_fotovoltaica_rasgada": lambda M: tech_pele_fotovoltaica(M, 1),
    "TECH_canopy_solar": tech_canopy_solar,
    "TECH_anexo_modular": tech_anexo_modular,
    "TECH_reciclador_agua": tech_reciclador_agua,
    "TECH_poste_sensor": tech_poste_sensor,
    "TECH_letreiro_led_farmacia": lambda M: tech_letreiro_led(M, "farmacia"),
    "TECH_letreiro_led_agua": lambda M: tech_letreiro_led(M, "agua"),
    "TECH_totem_recarga": tech_totem_recarga,
    "TECH_caixa_baterias": tech_caixa_baterias,
}


# ---------------------------------------------------------------------------
# REMENDOS — 2057–2072: fiação, lonas, varais, tubos, aparelhos, caixas d'água
# ---------------------------------------------------------------------------
def remendo_fiacao(M, span: float) -> bpy.types.Object:
    """Fiação aérea entre dois pontos a `span` m (eixo x): 5 cabos em catenária com flechas diferentes,
    emenda improvisada ('gato') pendurada e caixa de derivação. Origem: altura dos pontos de fixação
    (z=0), no meio do vão — os cabos pendem abaixo da origem."""
    s = P()
    rnd = random.Random(int(span))
    n = 10 if span <= 6 else 16
    for k in range(5):
        y = -0.08 + k * 0.05
        sag = span * (0.06 + 0.035 * rnd.random())
        pts = catenary((-span / 2, y, 0.02 * k), (span / 2, y + 0.03, 0.02 * k - 0.05), sag, n, side=0.05 * (rnd.random() - 0.5))
        polytube(f"cabo_{k}", pts, 0.012 if k else 0.02, M["rubber"], sides=5)
    # 'gato': cabo solto que desce do feixe e termina pendurado
    base = catenary((-span / 2, 0.0, 0), (span / 2, 0.0, -0.05), span * 0.08, n)[n // 3]
    polytube("gato", [tuple(base), (base.x + 0.1, base.y - 0.1, base.z - 0.6), (base.x + 0.25, base.y - 0.15, base.z - 1.3), (base.x + 0.2, base.y - 0.1, base.z - 1.9)], 0.01, M["rubber"], sides=4)
    box("emenda", (0.08, 0.08, 0.14), (base.x + 0.05, base.y - 0.05, base.z - 0.3), M["plastic_black"], bevel=0.006, segments=1)
    for xe in (-span / 2, span / 2):
        box(f"isolador_{xe}", (0.12, 0.3, 0.12), (xe, 0.0, 0.0), M["metal_dark"])
    if span > 6:
        box("derivacao", (0.3, 0.2, 0.4), (span / 2 - 0.3, 0.05, -0.45), M["painted_gray"], bevel=0.008, segments=1)
        polytube("derivacao_cabo", [(span / 2 - 0.3, 0.0, -0.25), (span / 2 - 0.2, 0.0, -0.05)], 0.012, M["rubber"], sides=4)
    return finish(parts_from(s), f"REMENDO_fiacao_{int(span)}m")


def remendo_lona(M) -> bpy.types.Object:
    """Lona azul (3 × 2,6 m) amarrada à parede e a dois mourões de madeira na frente, com cordas estaiadas
    ao chão e um canto rasgado caído. Origem no chão, na linha da parede (y=0)."""
    s = P()
    wavy_plane("lona", 3.0, 2.6, (0, -1.3, 2.45), M["tarp_blue"], rot=(math.radians(-6), 0, 0), nx=16, ny=12, amp=0.04, freq=4, sag=0.25)
    wavy_plane("lona_rasgo", 0.7, 0.9, (-1.3, -2.55, 1.9), M["tarp_blue"], rot=(math.radians(85), 0, 0.2), nx=4, ny=6, amp=0.05, freq=3)
    for x in (-1.45, 1.45):
        polytube(f"mourao_{x}", [(x, -2.55, 0), (x, -2.55, 2.35)], 0.045, M["wood"], sides=7)
        polytube(f"estai_{x}", [(x, -2.55, 2.3), (x * 1.35, -3.3, 0.0)], 0.008, M["fabric_cream"], sides=4)
        box(f"estaca_{x}", (0.06, 0.06, 0.25), (x * 1.35, -3.3, 0.1), M["rust_dark"])
    for x in (-1.3, 0.0, 1.3):
        polytube(f"amarra_{x}", [(x, -0.02, 2.6), (x, -0.1, 2.9), (x + 0.05, -0.02, 3.0)], 0.008, M["fabric_cream"], sides=4)
        box(f"gancho_{x}", (0.04, 0.05, 0.06), (x, -0.02, 2.95), M["rust"])
    collider("mourao_e", (0.1, 0.1, 2.35), (-1.45, -2.55, 1.17))
    collider("mourao_d", (0.1, 0.1, 2.35), (1.45, -2.55, 1.17))
    return finish(parts_from(s), "REMENDO_lona")


def remendo_toldo(M) -> bpy.types.Object:
    """Toldo retrátil de loja (3 m) com lona listrada desbotada, aba frontal, braços articulados e rolo
    na parede. Origem no chão, na linha da parede; a lona fica entre 2,4 e 2,9 m."""
    s = P()
    cylinder("rolo", 0.07, 3.1, (0, -0.1, 2.9), M["metal_dark"], segments=10, rot=(0, math.pi / 2, 0))
    wavy_plane("lona", 3.0, 1.5, (0, -0.85, 2.72), M["stripes_faded"], rot=(math.radians(-14), 0, 0), nx=12, ny=6, amp=0.025, freq=5)
    wavy_plane("aba", 3.0, 0.28, (0, -1.58, 2.4), M["stripes_faded"], rot=(math.radians(85), 0, 0), nx=12, ny=2, amp=0.02, freq=7)
    for x in (-1.4, 1.4):
        polytube(f"braco_{x}", [(x, -0.1, 2.75), (x, -0.9, 2.3), (x, -1.55, 2.55)], 0.018, M["aluminum"], sides=6)
        box(f"suporte_{x}", (0.08, 0.16, 0.3), (x, -0.08, 2.85), M["metal_dark"])
    polytube("barra_frente", [(-1.5, -1.55, 2.55), (1.5, -1.55, 2.55)], 0.02, M["aluminum"], sides=6)
    return finish(parts_from(s), "REMENDO_toldo")


def remendo_varal(M) -> bpy.types.Object:
    """Varal de parede (3 m) com dois braços de ferro, duas cordas e cinco peças de roupa (alpha) com
    pregadores. Origem: altura da corda (z=0), na linha da parede; roupas pendem abaixo."""
    s = P()
    for x in (-1.5, 1.5):
        polytube(f"braco_{x}", [(x, 0.0, -0.15), (x, -0.5, 0.0), (x, -0.5, -0.25)], 0.014, M["rust"], sides=5)
        box(f"chapa_{x}", (0.1, 0.02, 0.3), (x, -0.01, -0.15), M["rust"])
    for y in (-0.3, -0.48):
        polytube(f"corda_{y}", catenary((-1.5, y, 0.0), (1.5, y, 0.0), 0.06, 8), 0.006, M["fabric_cream"], sides=4)
    garments = [(-1.05, 0.6, 0.75, (0, 0.5, 0.5, 1.0)), (-0.35, 0.5, 0.95, (0.5, 0.5, 1.0, 1.0)), (0.3, 0.7, 0.6, (0, 0, 0.5, 0.5)), (1.0, 0.55, 0.9, (0.5, 0, 1.0, 0.5)), (-0.7, 0.55, 0.5, (0, 0, 0.5, 0.5))]
    for k, (x, w, h, rect) in enumerate(garments):
        y = -0.3 if k != 4 else -0.48
        zc = -0.05 - h / 2 if k != 4 else -0.08 - h / 2
        fit_uv(wavy_plane(f"roupa_{k}", w, h, (x, y, zc), M["clothes"], rot=(math.pi / 2, 0, 0), nx=4, ny=4, amp=0.025, freq=3), rect)
        for dx in (-w / 2 + 0.06, w / 2 - 0.06):
            box(f"pregador_{k}_{dx}", (0.015, 0.025, 0.06), (x + dx, y, -0.045 if k != 4 else -0.065), M["plastic_yellow"] if k % 2 else M["plastic_red"])
    return finish(parts_from(s), "REMENDO_varal")


def remendo_tubo_agua(M) -> bpy.types.Object:
    """Tubulação de água improvisada ao longo de 6 m de parede: prumada de PVC com cotovelos e braçadeiras,
    registro com volante, torneira, mangueira caída e balde. Origem no chão, na linha da parede."""
    s = P()
    polytube("prumada", [(-2.5, -0.08, 0), (-2.5, -0.08, 2.35), (-2.35, -0.08, 2.45), (2.2, -0.08, 2.45), (2.35, -0.08, 2.35), (2.35, -0.08, 1.0)], 0.028, M["pvc_white"], sides=7)
    for x, z in ((-2.5, 0.7), (-2.5, 1.8), (0.0, 2.45), (1.5, 2.45), (2.35, 1.6)):
        box(f"bracadeira_{x}_{z}", (0.1, 0.1, 0.05) if z != 2.45 else (0.05, 0.1, 0.1), (x, -0.04, z), M["metal_dark"])
    cylinder("registro", 0.05, 0.1, (2.35, -0.08, 1.0), M["painted_blue"], segments=10)
    torus("volante", 0.06, 0.01, (2.35, -0.19, 1.0), M["plastic_red"], rot=(math.pi / 2, 0, 0), seg_major=12, seg_minor=4)
    polytube("volante_eixo", [(2.35, -0.08, 1.0), (2.35, -0.2, 1.0)], 0.012, M["metal_light"], sides=5)
    polytube("torneira", [(2.35, -0.08, 0.9), (2.35, -0.3, 0.9), (2.35, -0.34, 0.8)], 0.02, M["metal_light"], sides=6)
    polytube("mangueira", [(2.35, -0.34, 0.75), (2.3, -0.5, 0.3), (1.9, -0.8, 0.03), (1.2, -0.9, 0.03), (0.7, -0.6, 0.03), (0.9, -0.3, 0.03), (1.3, -0.4, 0.03)], 0.016, M["hose_green"], sides=6)
    lathe("balde", [(0, 0), (0.14, 0), (0.16, 0.32), (0.14, 0.32), (0.13, 0.02), (0, 0.02)], M["plastic_blue"], segments=12, loc=(1.6, -0.55, 0))
    torus("balde_alca", 0.15, 0.008, (1.6, -0.55, 0.32), M["metal_light"], rot=(math.pi / 2, 0, 0.6), seg_major=10, seg_minor=4)
    box("caixa_medidor", (0.3, 0.14, 0.26), (-1.6, -0.07, 0.6), M["painted_blue"], bevel=0.008, segments=1)
    polytube("ramal_medidor", [(-2.5, -0.08, 0.6), (-1.75, -0.08, 0.6)], 0.02, M["pvc_white"], sides=6)
    stain("mancha_torneira", 0.5, 0.9, (2.35, -0.004, 0.45), M)
    collider("balde", (0.35, 0.35, 0.34), (1.6, -0.55, 0.17))
    return finish(parts_from(s), "REMENDO_tubo_agua")


def remendo_ar_condicionado(M) -> bpy.types.Object:
    """Ar-condicionado de janela (0,75 × 0,55 × 0,48 m) sobre mão-francesa, grelha frontal, venezianas
    laterais, dreno pingando e escorrido na parede. Origem: base traseira do aparelho, na parede."""
    s = P()
    box("corpo", (0.75, 0.55, 0.48), (0, -0.275, 0.24), M["metal_light"], bevel=0.015, segments=1)
    box("frente", (0.7, 0.03, 0.44), (0, -0.56, 0.24), M["plastic_white"], bevel=0.006, segments=1)
    for k in range(6):
        box(f"grelha_{k}", (0.6, 0.02, 0.025), (0, -0.585, 0.1 + k * 0.05), M["metal_dark"])
    box("painel", (0.6, 0.02, 0.06), (0, -0.585, 0.42), M["plastic_black"])
    for sx in (-1, 1):
        for k in range(5):
            box(f"veneziana_{sx}_{k}", (0.015, 0.4, 0.04), (sx * 0.37, -0.3, 0.1 + k * 0.08), M["metal_dark"], rot=(0, 0, 0))
    for x in (-0.3, 0.3):
        prism(f"mao_francesa_{x}", [(0.0, 0.0), (-0.5, 0.0), (0.0, -0.45)], 0.04, M["rust_dark"], axis="x", loc=(x, 0, 0))
    box("apoio", (0.7, 0.5, 0.03), (0, -0.25, -0.015), M["rust_dark"])
    polytube("dreno", [(0.3, -0.1, 0.0), (0.3, -0.1, -0.2), (0.28, -0.08, -0.35)], 0.008, M["pvc_white"], sides=4)
    stain("mancha_dreno", 0.4, 0.9, (0.28, -0.004, -0.6), M)
    return finish(parts_from(s), "REMENDO_ar_condicionado")


def remendo_caixa_dagua(M) -> bpy.types.Object:
    """Caixa d'água de polietileno de 1000 L (Ø1,4 × 1,1 m + tampa) sobre pilaretes de concreto, com
    boia, tubo de entrada e extravasor; variante de fibrocimento. Origem na base dos pilaretes."""
    s = P()
    z0 = 0.5
    for x in (-0.45, 0.45):
        for y in (-0.45, 0.45):
            box(f"pilarete_{x}_{y}", (0.2, 0.2, z0), (x, y, z0 / 2), M["concrete_dark"], bevel=0.01, segments=1)
    box("estrado", (1.3, 1.3, 0.08), (0, 0, z0 + 0.04), M["concrete"], bevel=0.01, segments=1)
    lathe("caixa", [(0, 0), (0.6, 0), (0.7, 0.3), (0.72, 0.6), (0.7, 1.0), (0.64, 1.1), (0, 1.1)], M["plastic_blue"], segments=18, loc=(0, 0, z0 + 0.08))
    for z in (0.35, 0.75):
        torus(f"nervura_{z}", 0.715, 0.018, (0, 0, z0 + 0.08 + z), M["plastic_blue"], seg_major=18, seg_minor=5)
    lathe("tampa", [(0, 0.1), (0.66, 0.0), (0.7, 0.0), (0.3, 0.14), (0, 0.16)], M["plastic_blue"], segments=18, loc=(0, 0, z0 + 1.16))
    polytube("entrada", [(-0.9, -0.3, 0.0), (-0.9, -0.3, z0 + 1.0), (-0.6, -0.3, z0 + 1.0), (-0.5, -0.3, z0 + 0.9)], 0.02, M["pvc_white"], sides=6)
    polytube("extravasor", [(0.72, 0.2, z0 + 1.0), (0.9, 0.2, z0 + 1.0), (0.9, 0.2, z0 + 0.4)], 0.025, M["pvc_white"], sides=6)
    polytube("saida", [(0.4, 0.4, z0 + 0.1), (0.4, 0.4, 0.0)], 0.025, M["pvc_white"], sides=6)
    stain("mancha_caixa", 0.9, 0.7, (0.0, -0.6, z0 + 0.5), M)
    collider("caixa", (1.45, 1.45, z0 + 1.35), (0, 0, (z0 + 1.35) / 2))
    return finish(parts_from(s), "REMENDO_caixa_dagua")


EXTRA_BUILDERS_REMENDO = {
    "REMENDO_fiacao_6m": lambda M: remendo_fiacao(M, 6.0),
    "REMENDO_fiacao_12m": lambda M: remendo_fiacao(M, 12.0),
    "REMENDO_lona": remendo_lona,
    "REMENDO_toldo": remendo_toldo,
    "REMENDO_varal": remendo_varal,
    "REMENDO_tubo_agua": remendo_tubo_agua,
    "REMENDO_ar_condicionado": remendo_ar_condicionado,
    "REMENDO_caixa_dagua": remendo_caixa_dagua,
}


# ---------------------------------------------------------------------------
# MARCOS — monumentais, visíveis de longe (um por quarteirão)
# ---------------------------------------------------------------------------
def marco_viaduto_maglev(M) -> bpy.types.Object:
    """Segmento de viaduto de maglev morto (24 m): pilar de concreto chanfrado com sapata e capitel em
    martelo, tabuleiro em caixão trapezoidal com via de guia (trilhos laterais, placa de reação, pacotes
    de estator), guarda-corpos, bandeja de cabos, postes apagados, juntas e vegetação. Origem na base
    do pilar; o tabuleiro vai de x=-12 a x=+12 e encaixa em sequência a cada 24 m."""
    s = P()
    L, DW, DH, PH = 24.0, 5.2, 1.7, 7.6
    conc = M["concrete"]
    dark = M["concrete_dark"]
    box("sapata", (3.6, 4.8, 0.5), (0, 0, 0.25), dark, bevel=0.03, segments=1)
    box("pilar", (2.0, 3.0, PH), (0, 0, 0.5 + PH / 2), conc, bevel=0.16, segments=2)
    for z in (2.5, 5.0):
        box(f"pilar_friso_{z}", (2.06, 3.06, 0.12), (0, 0, z), dark)
    prism("capitel", [(-1.5, PH - 0.3), (1.5, PH - 0.3), (2.7, PH + 0.9), (-2.7, PH + 0.9)], 2.2, conc, axis="x", loc=(0, 0, 0.5))
    box("capitel_topo", (2.4, 5.6, 0.3), (0, 0, 0.5 + PH + 1.05), dark, bevel=0.03, segments=1)
    for y in (-1.3, 1.3):
        box(f"aparelho_{y}", (1.0, 0.6, 0.18), (0, y, PH + 1.45 + 0.09), M["metal_dark"])
    z_deck = PH + 1.45 + 0.18 + 0.5
    # tabuleiro em caixão (trapézio) — o topo a z_deck + DH
    prism("caixao", [(-DW / 2, DH), (DW / 2, DH), (DW / 2 - 0.9, 0.0), (-DW / 2 + 0.9, 0.0)], L, conc, axis="x", loc=(0, 0, z_deck))
    for xe in (-L / 2, L / 2):
        box(f"junta_{xe}", (0.12, DW + 0.1, DH + 0.1), (xe, 0, z_deck + DH / 2), M["rubber"])
    # via de guia: guias laterais, placa de reação central e pacotes de estator sob as abas
    top = z_deck + DH
    for y in (-1.3, 1.3):
        box(f"guia_{y}", (L, 0.45, 0.42), (0, y, top + 0.21), dark, bevel=0.02, segments=1)
        box(f"trilho_{y}", (L, 0.12, 0.06), (0, y + (0.2 if y < 0 else -0.2), top + 0.45), M["rust"])
    box("placa_reacao", (L, 0.7, 0.08), (0, 0, top + 0.04), M["metal_dark"])
    for k in range(12):
        x = -L / 2 + 1.0 + k * 2.0
        for y in (-1.3, 1.3):
            box(f"estator_{k}_{y}", (1.6, 0.3, 0.25), (x, y * 1.08, top + 0.1), M["rust_dark"])
    # guarda-corpos, bandeja de cabos, postes de iluminação apagados
    for y in (-DW / 2 + 0.15, DW / 2 - 0.15):
        for k in range(9):
            box(f"gc_poste_{k}_{y}", (0.06, 0.06, 1.1), (-L / 2 + 0.5 + k * (L - 1.0) / 8, y, top + 0.55), M["metal_dark"])
        for z in (top + 0.55, top + 1.05):
            box(f"gc_rail_{z}_{y}", (L, 0.05, 0.05), (0, y, z), M["metal_dark"])
    box("bandeja", (L, 0.3, 0.1), (0, -DW / 2 - 0.2, top - 0.3), M["rust_dark"])
    for k in range(3):
        polytube(f"cabo_bandeja_{k}", catenary((-L / 2, -DW / 2 - 0.2 + k * 0.08, top - 0.25), (L / 2, -DW / 2 - 0.2 + k * 0.08, top - 0.25), 0.25, 10), 0.02, M["rubber"], sides=5)
    for x in (-8.0, 8.0):
        polytube(f"poste_{x}", [(x, DW / 2 - 0.3, top + 0.4), (x, DW / 2 - 0.3, top + 4.2), (x, DW / 2 - 1.2, top + 4.5)], 0.06, M["painted_gray"], sides=8, radius_end=0.035)
        box(f"luminaria_{x}", (0.5, 0.3, 0.1), (x, DW / 2 - 1.4, top + 4.45), M["painted_gray"], bevel=0.01, segments=1)
        box(f"luminaria_vidro_{x}", (0.42, 0.22, 0.02), (x, DW / 2 - 1.4, top + 4.39), M["lamp_dead"])
    # drenos pelo pilar, escorridos, vegetação nas juntas (cartões de folhagem) e canteiros de ocupação
    polytube("dreno", [(0.6, -1.32, top - 0.2), (0.6, -1.45, z_deck - 0.5), (0.6, -1.45, 0.6)], 0.05, M["pvc_brown"], sides=7)
    stain("mancha_pilar", 1.2, 3.0, (0.0, -1.304, PH - 2.0), M)
    stain("mancha_caixao", 4.0, 1.2, (-5.0, -DW / 2 - 0.004 + 0.0, z_deck + 0.9), M)
    rnd = random.Random(24)
    for k in range(7):
        x = -L / 2 + 1.5 + k * 3.4
        wavy_plane(f"mato_{k}", 0.9 + rnd.random() * 0.5, 0.7, (x, -1.3 + 0.1 * rnd.random(), top + 0.75), M["leaves"], rot=(math.pi / 2, 0, rnd.random() * math.pi), nx=2, ny=2, amp=0.04, freq=2)
        wavy_plane(f"mato_b_{k}", 0.8, 0.6, (x + 0.2, 1.3, top + 0.7), M["leaves"], rot=(math.pi / 2, 0, 1.0 + rnd.random() * math.pi), nx=2, ny=2, amp=0.04, freq=2)
    for x in (-10.0, 4.0):
        box(f"canteiro_{x}", (2.0, 0.8, 0.5), (x, 0.0, top + 0.33), M["wood"], bevel=0.01, segments=1)
        box(f"canteiro_terra_{x}", (1.9, 0.7, 0.04), (x, 0.0, top + 0.56), M["crops"])
        for j in range(3):
            wavy_plane(f"canteiro_folhas_{x}_{j}", 1.4, 0.6, (x, 0.0, top + 0.85), M["leaves"], rot=(math.pi / 2, 0, j * 1.05), nx=2, ny=2, amp=0.05, freq=2)
    # lona pendurada no guarda-corpo (sombra da feira) e cordas
    wavy_plane("lona_feira", 5.0, 2.2, (-3.0, -DW / 2 - 0.6, top - 0.2), M["tarp_blue"], rot=(math.radians(80), 0, 0), nx=10, ny=6, amp=0.05, freq=3, sag=0.15)
    collider("pilar", (2.1, 3.1, PH + 0.5), (0, 0, (PH + 0.5) / 2))
    collider("sapata", (3.6, 4.8, 0.5), (0, 0, 0.25))
    collider("tabuleiro", (L, DW, DH + 0.5), (0, 0, z_deck + (DH + 0.5) / 2))
    return finish(parts_from(s), "MARCO_viaduto_maglev")


def marco_torre_fazenda(M) -> bpy.types.Object:
    """Base de torre de vidro (12 × 12 m, 4 pavimentos = 12 m) ocupada como fazenda vertical: lajes com
    bordas, pilares redondos, núcleo de concreto, pele de vidro com montantes nos lados de trás/direita
    (vidros sujos, trincados, faltando), terraços recuados na frente/esquerda com calhas hidropônicas,
    hortaliças, luzes de cultivo (metade mortas), guarda-corpos de vidro e lona de ocupação. Origem no
    centro da fachada frontal (y=0), piso térreo; o topo fica aberto para continuação."""
    s = P()
    S_, FH, NF = 12.0, 3.0, 4
    conc = M["concrete"]
    yc = S_ / 2
    for k in range(NF + 1):
        box(f"laje_{k}", (S_ + 0.4, S_ + 0.4, 0.32), (0, yc, k * FH - 0.16 if k else 0.16), conc, bevel=0.02, segments=1)
        box(f"laje_borda_{k}", (S_ + 0.6, S_ + 0.6, 0.1), (0, yc, k * FH + 0.08 if k else 0.3), M["concrete_dark"])
    box("nucleo", (4.0, 4.0, NF * FH), (0.5, yc + 1.0, NF * FH / 2), M["concrete_dark"], bevel=0.03, segments=1)
    box("nucleo_porta", (1.2, 0.06, 2.2), (0.5, yc - 1.02, 1.1), M["metal_dark"])
    for x in (-5.4, -1.8, 1.8, 5.4):
        for y in (0.6, 4.2, 7.8, 11.4):
            if abs(x) < 3 and 2 < y < 10:
                continue
            cylinder(f"pilar_{x}_{y}", 0.3, NF * FH, (x, y, NF * FH / 2), conc, segments=10, cap=False)
    # pele de vidro: lado de trás (y = S) e lado direito (x = +S/2), 8 panos de 1,5 m por pavimento
    rnd = random.Random(12)
    glass_sets = {0: (0.0, 0.5, 0.5, 1.0), 1: (0.5, 0.5, 1.0, 1.0), 2: (0.0, 0.0, 0.5, 0.5), 3: (0.5, 0.0, 1.0, 0.5)}

    def pane(name, loc, rot, w, h):
        r = rnd.random()
        if r < 0.1:
            return  # vidro faltando
        kind = 0 if r < 0.6 else (1 if r < 0.8 else (2 if r < 0.9 else 3))
        p = plane(name, w, h, loc, M["glass_broken"], rot=rot, rect=glass_sets[kind])
        return p

    for k in range(NF):
        for i in range(8):
            u = -S_ / 2 + 0.75 + i * 1.5
            pane(f"vidro_t_{k}_{i}", (u, S_ - 0.05, k * FH + FH / 2 + 0.1), (0, 0, math.pi), 1.45, FH - 0.5)
            pane(f"vidro_d_{k}_{i}", (S_ / 2 - 0.05, u + yc, k * FH + FH / 2 + 0.1), (0, 0, math.pi / 2), 1.45, FH - 0.5)
    for i in range(9):
        u = -S_ / 2 + i * 1.5
        box(f"montante_t_{i}", (0.08, 0.12, NF * FH + 0.5), (u, S_ - 0.05, (NF * FH + 0.5) / 2), M["aluminum"])
        box(f"montante_d_{i}", (0.12, 0.08, NF * FH + 0.5), (S_ / 2 - 0.05, u + yc, (NF * FH + 0.5) / 2), M["aluminum"])
    for k in range(NF + 1):
        box(f"travessa_t_{k}", (S_, 0.1, 0.08), (0, S_ - 0.05, k * FH + 0.34), M["aluminum"])
        box(f"travessa_d_{k}", (0.1, S_, 0.08), (S_ / 2 - 0.05, yc, k * FH + 0.34), M["aluminum"])
    # térreo: pele de vidro alta na frente (hall), porta vedada com tábuas, placa de ocupação
    for i in range(8):
        u = -S_ / 2 + 0.75 + i * 1.5
        if i in (3, 4):
            continue
        pane(f"vidro_hall_{i}", (u, 0.05, FH / 2 + 0.1), (0, 0, 0), 1.45, FH - 0.5)
    for i in range(9):
        box(f"montante_f_{i}", (0.08, 0.12, FH), (-S_ / 2 + i * 1.5, 0.05, FH / 2), M["aluminum"])
    for k in range(5):
        box(f"tabua_{k}", (3.0, 0.05, 0.25), (0, -0.02, 0.5 + k * 0.5), M["wood"], rot=(0, (k % 2 - 0.5) * 0.08, 0))
    plane("placa_ocupacao", 2.4, 0.5, (0, -0.06, 2.6), M["placa_oficina"])
    # terraços (pavimentos 1–3) na frente e à esquerda: calhas hidropônicas, hortaliças, luzes de cultivo
    for k in range(1, NF):
        z = k * FH + 0.32
        for j in range(3):
            y = 0.9 + j * 1.0
            box(f"calha_f_{k}_{j}", (7.0, 0.5, 0.25), (-1.5, y, z + 0.5 + j * 0.3), M["pvc_white"], bevel=0.01, segments=1)
            box(f"calha_f_cult_{k}_{j}", (6.9, 0.44, 0.03), (-1.5, y, z + 0.64 + j * 0.3), M["crops"])
            for x in (-4.6, -1.5, 1.6):
                box(f"calha_pe_{k}_{j}_{x}", (0.05, 0.4, 0.5 + j * 0.3), (x, y, z + (0.5 + j * 0.3) / 2), M["metal_dark"])
            wavy_plane(f"folhas_f_{k}_{j}", 2.6, 0.5, (-1.5 + j * 0.6, y, z + 0.95 + j * 0.3), M["leaves"], rot=(math.pi / 2, 0, 0.2 + j * 0.9), nx=3, ny=2, amp=0.04, freq=2)
        for j in range(2):
            x = -S_ / 2 + 0.9 + j * 1.0
            box(f"calha_e_{k}_{j}", (0.5, 6.0, 0.25), (x, yc + 1.5, z + 0.5 + j * 0.3), M["pvc_white"], bevel=0.01, segments=1)
            box(f"calha_e_cult_{k}_{j}", (0.44, 5.9, 0.03), (x, yc + 1.5, z + 0.64 + j * 0.3), M["crops"])
            wavy_plane(f"folhas_e_{k}_{j}", 2.4, 0.5, (x, yc + 1.5 - j * 0.8, z + 0.95 + j * 0.3), M["leaves"], rot=(math.pi / 2, 0, 1.4 + j * 0.9), nx=3, ny=2, amp=0.04, freq=2)
        for i in range(4):
            lit = (i + k) % 2 == 0
            box(f"grow_{k}_{i}", (1.6, 0.08, 0.05), (-4.5 + i * 2.0, 2.0, z + FH - 0.5), M["grow_light"] if lit else M["lamp_dead"])
            polytube(f"grow_cabo_{k}_{i}", [(-4.5 + i * 2.0, 2.0, z + FH - 0.5), (-4.5 + i * 2.0, 2.0, z + FH - 0.32)], 0.01, M["rubber"], sides=4)
        # guarda-corpo de vidro (placas) + corrimão
        for i in range(8):
            u = -S_ / 2 + 0.75 + i * 1.5
            if rnd.random() < 0.85:
                plane(f"gc_f_{k}_{i}", 1.4, 1.0, (u, 0.02, z + 0.5), M["glass_broken"], rect=glass_sets[0])
        box(f"corrimao_f_{k}", (S_, 0.06, 0.06), (0, 0.02, z + 1.02), M["aluminum"])
        for i in range(8):
            u = yc - S_ / 2 + 0.75 + i * 1.5
            if rnd.random() < 0.85:
                plane(f"gc_e_{k}_{i}", 1.4, 1.0, (-S_ / 2 + 0.02, u, z + 0.5), M["glass_broken"], rot=(0, 0, -math.pi / 2), rect=glass_sets[0])
        box(f"corrimao_e_{k}", (0.06, S_, 0.06), (-S_ / 2 + 0.02, yc, z + 1.02), M["aluminum"])
    # lona de ocupação entre pilares (2º pavimento) e varal; caixa d'água no terraço do 3º
    wavy_plane("lona_ocupacao", 3.4, 2.2, (3.6, 0.7, 2 * FH + 1.6), M["tarp_blue"], rot=(math.radians(88), 0, 0), nx=8, ny=6, amp=0.05, freq=3, sag=0.1)
    polytube("varal", catenary((-5.0, 0.4, 3 * FH + 2.2), (-1.0, 0.4, 3 * FH + 2.2), 0.08, 6), 0.006, M["fabric_cream"], sides=4)
    for k, (x, rect) in enumerate(((-4.2, (0, 0.5, 0.5, 1)), (-3.2, (0.5, 0.5, 1, 1)), (-2.0, (0.5, 0, 1, 0.5)))):
        fit_uv(wavy_plane(f"roupa_{k}", 0.6, 0.8, (x, 0.4, 3 * FH + 1.75), M["clothes"], rot=(math.pi / 2, 0, 0), nx=3, ny=3, amp=0.02, freq=3), rect)
    stain("mancha_laje", 3.0, 0.8, (2.0, -0.004 - 0.3, 2 * FH + 0.12), M)
    stain("mancha_laje2", 2.5, 0.8, (-3.0, -0.004 - 0.3, 3 * FH + 0.12), M)
    # colisores: núcleo, lajes, pilares da frente e pele de vidro
    collider("nucleo", (4.0, 4.0, NF * FH), (0.5, yc + 1.0, NF * FH / 2))
    for k in range(NF + 1):
        collider(f"laje_{k}", (S_ + 0.4, S_ + 0.4, 0.34), (0, yc, k * FH - 0.17 if k else 0.17))
    collider("pele_tras", (S_, 0.3, NF * FH), (0, S_ - 0.05, NF * FH / 2))
    collider("pele_dir", (0.3, S_, NF * FH), (S_ / 2 - 0.05, yc, NF * FH / 2))
    collider("hall", (S_, 0.3, FH), (0, 0.05, FH / 2))
    for x in (-5.4, -1.8, 1.8, 5.4):
        collider(f"pilar_f_{x}", (0.6, 0.6, FH), (x, 0.6, FH / 2))
    return finish(parts_from(s), "MARCO_torre_fazenda")


EXTRA_BUILDERS_MARCO = {
    "MARCO_viaduto_maglev": marco_viaduto_maglev,
    "MARCO_torre_fazenda": marco_torre_fazenda,
}


# ---------------------------------------------------------------------------
# PROPS — 20 objetos brasileiros de rua, ≤ 600 triângulos cada
# ---------------------------------------------------------------------------
def prop_banca_dobravel(M) -> bpy.types.Object:
    """Banca de feira dobrável: pernas tubulares em X, tampo de tábuas, lona listrada com aba, dois caixotes
    com produto (textura) e balança."""
    s = P()
    for x in (-1.0, 1.0):
        polytube(f"x1_{x}", [(x, -0.5, 0), (x, 0.5, 0.8)], 0.015, M["metal_light"], sides=5)
        polytube(f"x2_{x}", [(x, 0.5, 0), (x, -0.5, 0.8)], 0.015, M["metal_light"], sides=5)
        polytube(f"montante_{x}", [(x, -0.55, 0.8), (x, -0.55, 2.0), (x, 0.55, 2.1), (x, 0.55, 0.8)], 0.015, M["metal_light"], sides=5)
    box("tampo", (2.2, 1.0, 0.04), (0, 0, 0.82), M["wood"])
    box("tampo_borda", (2.24, 0.05, 0.08), (0, -0.5, 0.8), M["wood"])
    wavy_plane("lona", 2.5, 1.5, (0, 0, 2.1), M["stripes_faded"], nx=10, ny=6, amp=0.04, freq=4, sag=0.08)
    wavy_plane("aba", 2.5, 0.35, (0, -0.75, 1.9), M["stripes_faded"], rot=(math.radians(82), 0, 0), nx=10, ny=2, amp=0.02, freq=6)
    for k, (x, mat) in enumerate(((-0.6, M["produce_orange"]), (0.3, M["produce_green"]))):
        box(f"caixote_{k}", (0.5, 0.36, 0.22), (x, 0.1, 0.95), M["wood"])
        box(f"produto_{k}", (0.46, 0.32, 0.08), (x, 0.1, 1.08), mat)
        for j in range(3):
            sphere(f"fruta_{k}_{j}", 0.05, (x - 0.14 + j * 0.14, 0.1 + (j % 2) * 0.1 - 0.05, 1.14), mat, subdiv=1)
    cylinder("balanca", 0.11, 0.05, (0.85, -0.25, 0.86), M["metal_dark"], segments=10)
    cylinder("balanca_prato", 0.14, 0.015, (0.85, -0.25, 1.1), M["metal_light"], segments=10)
    box("balanca_haste", (0.03, 0.03, 0.22), (0.85, -0.25, 0.98), M["metal_light"])
    collider("banca", (2.3, 1.1, 0.9), (0, 0, 0.45))
    return finish(parts_from(s), "PROP_banca_dobravel")


def prop_botijao(M) -> bpy.types.Object:
    """Botijão de gás P13 (perfil torneado, alça anelar, válvula)."""
    s = P()
    lathe("corpo", [(0, 0.04), (0.16, 0.04), (0.19, 0.1), (0.19, 0.5), (0.15, 0.58), (0.1, 0.6), (0.1, 0.68), (0, 0.68)], M["metal_light"], segments=14)
    lathe("base", [(0, 0), (0.17, 0), (0.17, 0.05), (0.15, 0.05), (0.15, 0.0)], M["rust_dark"], segments=14)
    torus("alca", 0.12, 0.012, (0, 0, 0.7), M["metal_light"], seg_major=14, seg_minor=4)
    cylinder("valvula", 0.025, 0.06, (0, 0, 0.7), M["rust_dark"], segments=8)
    collider("botijao", (0.4, 0.4, 0.72), (0, 0, 0.36))
    return finish(parts_from(s), "PROP_botijao")


def prop_gerador(M) -> bpy.types.Object:
    """Gerador a gasolina em gaiola tubular: chassi, tanque, motor com aletas, alternador, escape, painel e
    rodinhas."""
    s = P()
    for x in (-0.55, 0.55):
        polytube(f"gaiola_{x}", [(x, -0.35, 0.05), (x, -0.35, 0.9), (x, 0.35, 0.9), (x, 0.35, 0.05)], 0.02, M["rust"], sides=5)
    for y in (-0.35, 0.35):
        polytube(f"gaiola_x_{y}", [(-0.55, y, 0.9), (0.55, y, 0.9)], 0.02, M["rust"], sides=5)
    box("chassi", (1.1, 0.7, 0.06), (0, 0, 0.12), M["metal_dark"])
    box("tanque", (1.0, 0.6, 0.18), (0, 0, 0.78), M["painted_red"], bevel=0.02, segments=1)
    cylinder("tampa", 0.05, 0.04, (0.3, 0.15, 0.89), M["metal_dark"], segments=8)
    box("motor", (0.5, 0.45, 0.45), (-0.2, 0, 0.4), M["metal_dark"], bevel=0.02, segments=1)
    for k in range(4):
        box(f"aleta_{k}", (0.52, 0.47, 0.02), (-0.2, 0, 0.27 + k * 0.1), M["metal_light"])
    cylinder("alternador", 0.16, 0.4, (0.3, 0, 0.36), M["rust_dark"], segments=10, rot=(0, math.pi / 2, 0))
    polytube("escape", [(-0.45, -0.2, 0.7), (-0.5, -0.2, 0.95), (-0.6, -0.1, 1.0)], 0.03, M["rust"], sides=6)
    box("painel", (0.26, 0.04, 0.2), (0.4, -0.37, 0.5), M["metal_light"])
    sphere("led", 0.015, (0.33, -0.39, 0.55), M["screen"], subdiv=0)
    for x in (-0.4, 0.4):
        cylinder(f"roda_{x}", 0.12, 0.06, (x, 0.4, 0.12), M["rubber"], segments=12, rot=(math.pi / 2, 0, 0))
    polytube("cabo", [(-0.3, 0.1, 0.1), (-0.6, 0.5, 0.02), (-1.0, 0.7, 0.02)], 0.015, M["rubber"], sides=5)
    collider("gerador", (1.2, 0.8, 0.95), (0, 0, 0.48))
    return finish(parts_from(s), "PROP_gerador")


def prop_caixa_distribuicao(M) -> bpy.types.Object:
    """Caixa de distribuição elétrica de rua (1,5 m): gabinete verde sobre pedestal de concreto, porta com
    dobradiças e cadeado, adesivo de advertência, eletrodutos e grelha."""
    s = P()
    box("pedestal", (0.8, 0.5, 0.35), (0, 0, 0.175), M["concrete_dark"], bevel=0.015, segments=1)
    box("gabinete", (0.7, 0.4, 1.1), (0, 0, 0.9), M["painted_green"], bevel=0.015, segments=1)
    box("tampa", (0.76, 0.46, 0.06), (0, 0, 1.47), M["painted_green"], bevel=0.01, segments=1)
    box("porta", (0.6, 0.02, 0.96), (0, -0.205, 0.9), M["painted_green"])
    for z in (0.55, 1.25):
        box(f"dobradica_{z}", (0.04, 0.03, 0.1), (-0.31, -0.21, z), M["metal_dark"])
    box("cadeado", (0.05, 0.03, 0.07), (0.25, -0.22, 0.9), M["metal_light"])
    plane("adesivo", 0.18, 0.18, (0.1, -0.216, 1.15), M["warning"], rect=(0, 0, 1, 1))
    for k in range(5):
        box(f"grelha_{k}", (0.25, 0.02, 0.02), (0, -0.215, 0.5 + k * 0.04), M["metal_dark"])
    for x in (-0.15, 0.0, 0.15):
        cylinder(f"eletroduto_{x}", 0.025, 0.6, (x, 0.12, 1.75), M["pvc_white"], segments=6)
    stain("mancha_cx", 0.5, 0.4, (0, -0.254, 0.5), M)
    collider("caixa", (0.8, 0.5, 1.5), (0, 0, 0.75))
    return finish(parts_from(s), "PROP_caixa_distribuicao")


def prop_bancada_oficina(M) -> bpy.types.Object:
    """Bancada de oficina (2 × 0,7 × 0,9 m): tampo de madeira, estrutura de cantoneira, prateleira,
    morsa, painel de ferramentas (silhuetas em alpha), lata de óleo e caixa de ferramentas."""
    s = P()
    box("tampo", (2.0, 0.7, 0.06), (0, 0, 0.9), M["wood"], bevel=0.006, segments=1)
    for x in (-0.95, 0.95):
        for y in (-0.3, 0.3):
            box(f"perna_{x}_{y}", (0.05, 0.05, 0.87), (x, y, 0.435), M["metal_dark"])
    box("prateleira", (1.9, 0.6, 0.03), (0, 0, 0.3), M["wood"])
    box("travessa", (1.9, 0.04, 0.04), (0, -0.3, 0.6), M["metal_dark"])
    # morsa
    box("morsa_base", (0.2, 0.2, 0.08), (0.7, -0.15, 0.97), M["metal_dark"])
    box("morsa_mordente", (0.18, 0.08, 0.14), (0.7, -0.26, 1.07), M["metal_dark"])
    box("morsa_movel", (0.18, 0.06, 0.14), (0.7, -0.36, 1.07), M["metal_dark"])
    cylinder("morsa_fuso", 0.012, 0.3, (0.7, -0.5, 1.03), M["metal_light"], segments=6, rot=(math.pi / 2, 0, 0))
    cylinder("morsa_alavanca", 0.008, 0.2, (0.7, -0.6, 1.03), M["metal_light"], segments=5, rot=(0, math.pi / 2, 0))
    # painel de ferramentas no fundo
    box("painel", (1.8, 0.03, 0.9), (0, 0.35, 1.45), M["wood"])
    plane("ferramentas", 1.7, 0.8, (0, 0.33, 1.45), M["pegboard"])
    # lata de óleo, caixa de ferramentas, peças
    lathe("lata", [(0, 0), (0.07, 0), (0.07, 0.2), (0.03, 0.24), (0.03, 0.28), (0, 0.28)], M["painted_yellow"], segments=10, loc=(-0.6, 0.15, 0.93))
    box("caixa_ferr", (0.45, 0.2, 0.18), (-0.2, 0.1, 1.02), M["painted_red"], bevel=0.008, segments=1)
    box("caixa_ferr_alca", (0.2, 0.03, 0.03), (-0.2, 0.1, 1.13), M["metal_dark"])
    box("bateria", (0.3, 0.18, 0.2), (0.2, 0.15, 1.03), M["battery"], bevel=0.008, segments=1)
    for k in range(3):
        box(f"peca_{k}", (0.12, 0.08, 0.06), (-0.8 + k * 0.1, -0.2 + k * 0.05, 0.33), M["rust_dark"])
    collider("bancada", (2.0, 0.8, 0.95), (0, 0, 0.475))
    return finish(parts_from(s), "PROP_bancada_oficina")


def prop_bicicleta(M) -> bpy.types.Object:
    """Bicicleta de carga (tipo cargueira): quadro tubular, duas rodas, garfo, guidão, selim, pedivela,
    bagageiro traseiro com caixa."""
    s = P()
    R = 0.33
    for x, name in ((-0.5, "tras"), (0.55, "frente")):
        torus(f"pneu_{name}", R, 0.03, (x, 0, R + 0.03), M["rubber"], rot=(math.pi / 2, 0, 0), seg_major=12, seg_minor=4)
        cylinder(f"cubo_{name}", 0.03, 0.1, (x, 0, R + 0.03), M["metal_light"], segments=6, rot=(math.pi / 2, 0, 0))
        for k in range(3):
            a = k * math.pi / 3
            box(f"raio_{name}_{k}", (0.006, 0.006, 2 * R - 0.02), (x, 0, R + 0.03), M["metal_light"], rot=(0, a, 0))
    zc = R + 0.03
    frame = M["painted_blue"]
    polytube("quadro_top", [(-0.45, 0, zc + 0.52), (0.4, 0, zc + 0.6)], 0.015, frame, sides=6)
    polytube("quadro_down", [(0.4, 0, zc + 0.6), (-0.1, 0, zc + 0.05)], 0.015, frame, sides=6)
    polytube("quadro_seat", [(-0.1, 0, zc + 0.05), (-0.25, 0, zc + 0.7)], 0.015, frame, sides=6)
    polytube("quadro_tras", [(-0.1, 0.04, zc + 0.05), (-0.5, 0.04, zc)], 0.012, frame, sides=5)
    polytube("quadro_tras2", [(-0.25, 0.04, zc + 0.55), (-0.5, 0.04, zc)], 0.012, frame, sides=5)
    polytube("garfo", [(0.42, 0.0, zc + 0.75), (0.5, 0.0, zc + 0.3), (0.55, 0.04, zc)], 0.012, frame, sides=5)
    polytube("guidao", [(0.42, -0.3, zc + 0.78), (0.42, -0.1, zc + 0.75), (0.42, 0.1, zc + 0.75), (0.42, 0.3, zc + 0.78)], 0.012, M["metal_light"], sides=5)
    box("selim", (0.26, 0.16, 0.05), (-0.28, 0, zc + 0.78), M["leather"], bevel=0.015, segments=1)
    polytube("canote", [(-0.25, 0, zc + 0.7), (-0.28, 0, zc + 0.77)], 0.012, M["metal_light"], sides=5)
    cylinder("pedivela", 0.06, 0.04, (-0.1, 0, zc + 0.05), M["metal_dark"], segments=8, rot=(math.pi / 2, 0, 0))
    for sy in (-1, 1):
        polytube(f"pedal_{sy}", [(-0.1, sy * 0.03, zc + 0.05), (-0.1 - sy * 0.15, sy * 0.08, zc + 0.05 + sy * 0.1)], 0.01, M["metal_dark"], sides=4)
        box(f"pedal_p_{sy}", (0.08, 0.06, 0.02), (-0.1 - sy * 0.15, sy * 0.1, zc + 0.05 + sy * 0.1), M["plastic_black"])
    box("bagageiro", (0.5, 0.35, 0.03), (-0.55, 0, zc + 0.5), M["metal_dark"])
    for y in (-0.15, 0.15):
        polytube(f"bagageiro_pe_{y}", [(-0.7, y, zc + 0.48), (-0.6, y, zc + 0.08)], 0.008, M["metal_dark"], sides=4)
    box("caixa_carga", (0.45, 0.32, 0.3), (-0.55, 0, zc + 0.67), M["lattice_red"])
    collider("bicicleta", (1.6, 0.5, 1.1), (0.0, 0, 0.55))
    return finish(parts_from(s), "PROP_bicicleta")


def prop_placa_rua(M) -> bpy.types.Object:
    """Placa de rua da Central: poste galvanizado, placa 'SETOR 17 / QUADRA 03' e segunda placa torta."""
    s = P()
    cylinder("poste", 0.03, 2.6, (0, 0, 1.3), M["aluminum"], segments=8)
    box("placa_fundo", (0.7, 0.03, 0.35), (0.35, -0.0, 2.3), M["painted_blue"])
    plane("placa", 0.66, 0.31, (0.35, -0.016, 2.3), M["placa_setor"])
    box("placa2_fundo", (0.5, 0.03, 0.25), (-0.25, 0.0, 1.95), M["painted_white"], rot=(0, 0.12, 0.05))
    plane("placa2", 0.46, 0.21, (-0.25, -0.016, 1.95), M["placa_oficina"], rot=(0, 0.12, 0.05))
    for z in (2.3, 1.95):
        box(f"abracadeira_{z}", (0.08, 0.08, 0.05), (0, 0, z), M["metal_dark"])
    collider("placa", (0.1, 0.1, 2.6), (0, 0, 1.3))
    return finish(parts_from(s), "PROP_placa_rua")


def prop_grade(M) -> bpy.types.Object:
    """Grade/portão de ferro (2 × 1,9 m): quadro, barras verticais com ponta de lança, travessa diagonal
    e dobradiças; pintura preta descascada."""
    s = P()
    fr = M["metal_dark"]
    for z in (0.08, 1.0, 1.75):
        box(f"travessa_{z}", (2.0, 0.04, 0.05), (0, 0, z), fr)
    for x in (-0.98, 0.98):
        box(f"montante_{x}", (0.05, 0.05, 1.9), (x, 0, 0.95), fr)
    for k in range(9):
        x = -0.8 + k * 0.2
        cylinder(f"barra_{k}", 0.012, 1.84, (x, 0, 0.96), fr, segments=5, cap=False)
        prism(f"lanca_{k}", [(-0.03, 0.0), (0.03, 0.0), (0.0, 0.12)], 0.02, fr, axis="y", loc=(x, 0, 1.88))
    polytube("diagonal", [(-0.95, 0.0, 0.12), (0.95, 0.0, 1.7)], 0.012, fr, sides=4)
    for z in (0.3, 1.5):
        cylinder(f"dobradica_{z}", 0.03, 0.12, (-1.02, 0, z), M["rust"], segments=6)
    box("fechadura", (0.1, 0.06, 0.16), (0.93, 0, 1.0), M["rust"])
    collider("grade", (2.1, 0.12, 2.0), (0, 0, 1.0))
    return finish(parts_from(s), "PROP_grade")


def prop_carrinho_mao(M) -> bpy.types.Object:
    """Carrinho de mão: caçamba trapezoidal, roda, dois braços de madeira com apoios, carga de entulho."""
    s = P()
    prism("cacamba", [(-0.45, 0.55), (0.45, 0.55), (0.3, 0.3), (-0.3, 0.3)], 0.6, M["rust_dark"], axis="x", loc=(0, 0, 0))
    prism("cacamba_frente", [(-0.3, 0.3), (0.3, 0.3), (0.45, 0.55), (-0.45, 0.55)], 0.04, M["rust_dark"], axis="x", loc=(0.3, 0, 0.0))
    box("fundo", (0.6, 0.6, 0.04), (0, 0, 0.3), M["rust_dark"])
    for sy in (-1, 1):
        box(f"braco_{sy}", (1.2, 0.04, 0.04), (-0.35, sy * 0.28, 0.33), M["wood"], rot=(0, 0.08, 0))
        box(f"pe_{sy}", (0.04, 0.04, 0.33), (-0.55, sy * 0.28, 0.165), M["metal_dark"])
        box(f"punho_{sy}", (0.14, 0.05, 0.05), (-0.92, sy * 0.28, 0.42), M["rubber"])
    cylinder("roda", 0.17, 0.08, (0.45, 0, 0.17), M["rubber"], segments=12, rot=(math.pi / 2, 0, 0))
    cylinder("cubo", 0.05, 0.12, (0.45, 0, 0.17), M["metal_light"], segments=6, rot=(math.pi / 2, 0, 0))
    for sy in (-1, 1):
        polytube(f"garfo_{sy}", [(0.45, sy * 0.06, 0.17), (0.2, sy * 0.2, 0.3)], 0.012, M["metal_dark"], sides=4)
    sphere("entulho", 0.28, (0.0, 0, 0.5), M["sand"], subdiv=1)
    collider("carrinho", (1.5, 0.7, 0.6), (-0.1, 0, 0.3))
    return finish(parts_from(s), "PROP_carrinho_mao")


def prop_barril_metalico(M) -> bpy.types.Object:
    """Tambor metálico de 200 L com duas nervuras e tampa com bujão (enferrujado)."""
    s = P()
    lathe("corpo", [(0, 0), (0.27, 0), (0.29, 0.03), (0.29, 0.28), (0.305, 0.3), (0.29, 0.32), (0.29, 0.56), (0.305, 0.58), (0.29, 0.6), (0.29, 0.86), (0.27, 0.88), (0, 0.88)], M["rust"], segments=16)
    cylinder("bujao", 0.03, 0.02, (0.15, 0.1, 0.89), M["metal_dark"], segments=8)
    collider("barril", (0.6, 0.6, 0.9), (0, 0, 0.45))
    return finish(parts_from(s), "PROP_barril_metalico")


def prop_conteiner_pequeno(M) -> bpy.types.Object:
    """Contêiner de 10 pés (3 × 2,4 × 2,6 m) de chapa corrugada, cantoneiras ISO, portas com barras de
    travamento e dobradiças; usado como depósito/moradia."""
    s = P()
    W, D, H = 3.0, 2.4, 2.6
    box("corpo", (W, D, H), (0, D / 2, H / 2), M["corrugated"])
    for x in (-W / 2, W / 2):
        for y in (0, D):
            for z in (0.15, H - 0.15):
                box(f"canto_{x}_{y}_{z}", (0.18, 0.18, 0.3), (x, y, z), M["metal_dark"])
    for y in (0, D):
        box(f"longarina_{y}", (W, 0.1, 0.16), (0, y, 0.1), M["painted_blue"])
        box(f"longarina_t_{y}", (W, 0.1, 0.12), (0, y, H - 0.06), M["painted_blue"])
    box("porta_quadro", (W - 0.3, 0.06, H - 0.3), (0, -0.03, H / 2), M["painted_blue"])
    for k, x in enumerate((-1.0, -0.5, 0.5, 1.0)):
        cylinder(f"barra_{k}", 0.02, H - 0.5, (x, -0.1, H / 2), M["metal_light"], segments=6)
        for z in (0.5, H - 0.5):
            box(f"guia_{k}_{z}", (0.08, 0.08, 0.06), (x, -0.08, z), M["metal_dark"])
        box(f"alavanca_{k}", (0.04, 0.12, 0.3), (x + (0.08 if x < 0 else -0.08), -0.14, 1.1), M["metal_dark"], rot=(0, 0.3 if x < 0 else -0.3, 0))
    for z in (0.6, 1.3, 2.0):
        for x in (-W / 2 + 0.12, W / 2 - 0.12):
            box(f"dobradica_{x}_{z}", (0.06, 0.08, 0.14), (x, -0.06, z), M["metal_dark"])
    stain("mancha_cont", 1.2, 1.0, (0.6, -0.065, 1.0), M)
    collider("conteiner", (W, D, H), (0, D / 2, H / 2))
    return finish(parts_from(s), "PROP_conteiner_pequeno")


def prop_mesa_bar(M) -> bpy.types.Object:
    """Mesa de bar de plástico (Ø0,7 m) com faixa colorida e pé de coluna."""
    s = P()
    lathe("mesa", [(0, 0), (0.25, 0), (0.25, 0.03), (0.06, 0.05), (0.06, 0.68), (0.35, 0.7), (0.35, 0.73), (0, 0.73)], M["plastic_white"], segments=14)
    torus("faixa", 0.35, 0.012, (0, 0, 0.715), M["plastic_red"], seg_major=14, seg_minor=4)
    collider("mesa", (0.7, 0.7, 0.74), (0, 0, 0.37))
    return finish(parts_from(s), "PROP_mesa_bar")


def prop_cadeira_plastica(M) -> bpy.types.Object:
    """Cadeira monobloco de plástico branco (encosto com três aberturas, braços, pernas afuniladas)."""
    s = P()
    pm = M["plastic_white"]
    box("assento", (0.46, 0.46, 0.04), (0, 0, 0.44), pm, bevel=0.015, segments=1)
    for k in range(3):
        box(f"encosto_{k}", (0.44, 0.03, 0.09), (0, 0.22, 0.56 + k * 0.13), pm, rot=(math.radians(-8), 0, 0))
    for sx in (-1, 1):
        box(f"encosto_lat_{sx}", (0.035, 0.03, 0.46), (sx * 0.21, 0.23, 0.68), pm, rot=(math.radians(-8), 0, 0))
        box(f"braco_{sx}", (0.05, 0.42, 0.03), (sx * 0.24, 0.0, 0.66), pm, bevel=0.01, segments=1)
        box(f"braco_pe_{sx}", (0.04, 0.03, 0.2), (sx * 0.24, -0.18, 0.55), pm)
    for sx in (-1, 1):
        for sy in (-1, 1):
            polytube(f"perna_{sx}_{sy}", [(sx * 0.2, sy * 0.2, 0.42), (sx * 0.22, sy * 0.22, 0.0)], 0.022, pm, sides=4, radius_end=0.015)
    collider("cadeira", (0.5, 0.5, 0.9), (0, 0.02, 0.45))
    return finish(parts_from(s), "PROP_cadeira_plastica")


def prop_cavalete(M) -> bpy.types.Object:
    """Cavalete de obra/sinalização: dois cavaletes em A e tábua com faixas de advertência."""
    s = P()
    for x in (-0.7, 0.7):
        for sy in (-1, 1):
            polytube(f"perna_{x}_{sy}", [(x, sy * 0.3, 0), (x, sy * 0.05, 0.95)], 0.02, M["wood"], sides=4)
        box(f"topo_{x}", (0.08, 0.14, 0.06), (x, 0, 0.97), M["wood"])
        box(f"trava_{x}", (0.04, 0.5, 0.03), (x, 0, 0.4), M["wood"])
    t = box("tabua", (1.9, 0.04, 0.22), (0, 0, 1.1), M["warning"])
    fit_uv(t, (0, 0, 4.0, 0.5))
    collider("cavalete", (1.9, 0.6, 1.2), (0, 0, 0.6))
    return finish(parts_from(s), "PROP_cavalete")


def prop_pneu(M) -> bpy.types.Object:
    """Pneu de caminhonete deitado (Ø0,75 m), com aro enferrujado."""
    s = P()
    torus("pneu", 0.28, 0.1, (0, 0, 0.1), M["rubber"], seg_major=18, seg_minor=8)
    cylinder("aro", 0.19, 0.16, (0, 0, 0.1), M["rust"], segments=12)
    collider("pneu", (0.76, 0.76, 0.2), (0, 0, 0.1))
    return finish(parts_from(s), "PROP_pneu")


def prop_saco_lixo(M) -> bpy.types.Object:
    """Saco de lixo preto amarrado (icosfera deformada com ruído) e nó."""
    s = P()
    rnd = random.Random(8)
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=0.32)
    for v in bm.verts:
        n = 1.0 + 0.12 * (_noise(v.co.x * 5, v.co.y * 5, 3) - 0.5) + 0.06 * math.sin(v.co.z * 9)
        v.co.x *= n * 1.1
        v.co.y *= n
        v.co.z = v.co.z * 0.75 * n + 0.26
        if v.co.z < 0.02:
            v.co.z = 0.02
    _mesh_obj("saco", bm, M["plastic_black"], smooth=True)
    sphere("no", 0.06, (0.05, 0.0, 0.52), M["plastic_black"], subdiv=1)
    collider("saco", (0.7, 0.65, 0.55), (0, 0, 0.27))
    return finish(parts_from(s), "PROP_saco_lixo")


def prop_cone(M) -> bpy.types.Object:
    """Cone de sinalização laranja com faixa branca e base quadrada."""
    s = P()
    box("base", (0.4, 0.4, 0.03), (0, 0, 0.015), M["plastic_black"], bevel=0.01, segments=1)
    lathe("cone", [(0.15, 0.03), (0.04, 0.72), (0.0, 0.73)], M["plastic_orange"], segments=12)
    lathe("faixa", [(0.125, 0.3), (0.095, 0.45), (0.0, 0.45)], M["plastic_white"], segments=12)
    collider("cone", (0.4, 0.4, 0.73), (0, 0, 0.365))
    return finish(parts_from(s), "PROP_cone")


def prop_banco_praca(M) -> bpy.types.Object:
    """Banco de praça: pés de concreto, cinco ripas de assento e duas de encosto."""
    s = P()
    for x in (-0.75, 0.75):
        box(f"pe_{x}", (0.12, 0.5, 0.42), (x, 0, 0.21), M["concrete_dark"], bevel=0.02, segments=1)
        box(f"encosto_pe_{x}", (0.1, 0.08, 0.5), (x, 0.24, 0.6), M["concrete_dark"], rot=(math.radians(-12), 0, 0))
    for k in range(4):
        box(f"ripa_{k}", (1.8, 0.09, 0.035), (0, -0.2 + k * 0.12, 0.44), M["wood"])
    for k in range(2):
        box(f"ripa_enc_{k}", (1.8, 0.035, 0.09), (0, 0.27 + k * 0.025, 0.62 + k * 0.12), M["wood"], rot=(math.radians(-12), 0, 0))
    collider("banco", (1.9, 0.6, 0.9), (0, 0.05, 0.45))
    return finish(parts_from(s), "PROP_banco_praca")


def prop_engradado(M) -> bpy.types.Object:
    """Engradado plástico de garrafas (amarelo, com grade vazada em alpha) com 12 garrafas."""
    s = P()
    W, D, H = 0.52, 0.36, 0.3
    box("fundo", (W, D, 0.03), (0, 0, 0.015), M["plastic_yellow"])
    for y, rot in ((-D / 2, 0), (D / 2, math.pi)):
        plane(f"lado_y_{y}", W, H, (0, y, H / 2), M["lattice_yellow"], rot=(0, 0, rot), rect=(0, 0, 1.4, 1))
    for x, rot in ((-W / 2, math.pi / 2), (W / 2, -math.pi / 2)):
        plane(f"lado_x_{x}", D, H, (x, 0, H / 2), M["lattice_yellow"], rot=(0, 0, rot), rect=(0, 0, 1, 1))
    for k in range(4):
        x = -W / 2 + k * (W / 3)
        box(f"coluna_{k}", (0.025, 0.025, H), (x, -D / 2, H / 2), M["plastic_yellow"])
        box(f"coluna_b_{k}", (0.025, 0.025, H), (x, D / 2, H / 2), M["plastic_yellow"])
    for i in range(4):
        for j in range(3):
            if (i, j) in ((1, 2), (3, 0), (0, 1), (2, 0)):
                continue
            lathe(f"garrafa_{i}_{j}", [(0.035, 0.03), (0.035, 0.2), (0.012, 0.27), (0.012, 0.31), (0, 0.31)], M["glass_bottle"], segments=6, loc=(-0.19 + i * 0.125, -0.12 + j * 0.12, 0))
    collider("engradado", (W, D, H), (0, 0, H / 2))
    return finish(parts_from(s), "PROP_engradado")


def prop_caixa_hidrante(M) -> bpy.types.Object:
    """Caixa de hidrante vermelha sobre pedestal: abrigo com visor, mangueira enrolada, registro com volante
    e coluna de hidrante ao lado."""
    s = P()
    box("pedestal", (0.9, 0.4, 0.3), (0, 0, 0.15), M["concrete_dark"], bevel=0.015, segments=1)
    box("abrigo", (0.9, 0.35, 0.7), (0, 0, 0.65), M["painted_red"], bevel=0.015, segments=1)
    box("abrigo_porta", (0.8, 0.02, 0.6), (0, -0.18, 0.65), M["painted_red"])
    box("visor", (0.5, 0.01, 0.3), (0, -0.192, 0.72), M["glass_dark"])
    torus("mangueira", 0.14, 0.05, (0, -0.1, 0.66), M["fabric_cream"], rot=(math.pi / 2, 0, 0), seg_major=12, seg_minor=5)
    box("puxador", (0.1, 0.03, 0.03), (0.3, -0.2, 0.5), M["metal_light"])
    lathe("hidrante", [(0, 0), (0.1, 0), (0.1, 0.1), (0.08, 0.1), (0.08, 0.75), (0.1, 0.75), (0.1, 0.9), (0.07, 0.98), (0, 1.0)], M["painted_red"], segments=10, loc=(0.75, 0, 0))
    cylinder("hidrante_saida", 0.045, 0.14, (0.75, -0.12, 0.6), M["painted_red"], segments=8, rot=(math.pi / 2, 0, 0))
    cylinder("hidrante_tampa", 0.05, 0.03, (0.75, -0.2, 0.6), M["metal_dark"], segments=8, rot=(math.pi / 2, 0, 0))
    torus("volante", 0.06, 0.01, (0.75, 0, 1.02), M["metal_dark"], seg_major=10, seg_minor=4)
    stain("mancha_hidrante", 0.6, 0.3, (0, -0.176, 0.4), M)
    collider("hidrante", (1.1, 0.45, 1.0), (0.1, 0, 0.5))
    return finish(parts_from(s), "PROP_caixa_hidrante")


EXTRA_BUILDERS_PROP = {
    "PROP_banca_dobravel": prop_banca_dobravel,
    "PROP_botijao": prop_botijao,
    "PROP_gerador": prop_gerador,
    "PROP_caixa_distribuicao": prop_caixa_distribuicao,
    "PROP_bancada_oficina": prop_bancada_oficina,
    "PROP_bicicleta": prop_bicicleta,
    "PROP_placa_rua": prop_placa_rua,
    "PROP_grade": prop_grade,
    "PROP_carrinho_mao": prop_carrinho_mao,
    "PROP_barril_metalico": prop_barril_metalico,
    "PROP_conteiner_pequeno": prop_conteiner_pequeno,
    "PROP_mesa_bar": prop_mesa_bar,
    "PROP_cadeira_plastica": prop_cadeira_plastica,
    "PROP_cavalete": prop_cavalete,
    "PROP_pneu": prop_pneu,
    "PROP_saco_lixo": prop_saco_lixo,
    "PROP_cone": prop_cone,
    "PROP_banco_praca": prop_banco_praca,
    "PROP_engradado": prop_engradado,
    "PROP_caixa_hidrante": prop_caixa_hidrante,
}


# === EXPORT ===
# ---------------------------------------------------------------------------
# Registro, exportação e catálogo
# ---------------------------------------------------------------------------
def builders() -> dict:
    b = {}
    for v in (0, 1):
        b[f"FACHADA_terreo_loja_{v}"] = lambda M, v=v: fachada_terreo_loja(M, v)
        b[f"FACHADA_terreo_casa_{v}"] = lambda M, v=v: fachada_terreo_casa(M, v)
        b[f"FACHADA_apto_janelas_{v}"] = lambda M, v=v: fachada_apto_janelas(M, v)
        b[f"FACHADA_apto_sacada_{v}"] = lambda M, v=v: fachada_apto_sacada(M, v)
        b[f"FACHADA_apto_servico_{v}"] = lambda M, v=v: fachada_apto_servico(M, v)
        b[f"FACHADA_galpao_{v}"] = lambda M, v=v: fachada_galpao(M, v)
        b[f"FACHADA_esquina_{v}"] = lambda M, v=v: fachada_esquina(M, v)
        b[f"FACHADA_topo_{v}"] = lambda M, v=v: fachada_topo(M, v)
    for name, fn in EXTRA_BUILDERS.items():
        b[name] = fn
    return b


EXTRA_BUILDERS: dict = {**EXTRA_BUILDERS_TECH, **EXTRA_BUILDERS_REMENDO, **EXTRA_BUILDERS_MARCO, **EXTRA_BUILDERS_PROP}

BUDGET = {"FACHADA": 1500, "PROP": 600, "TECH": 1500, "REMENDO": 1000, "MARCO": 9000}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(REPO, "public", "assets", "environments", "kit_tech.glb"))
    ap.add_argument("--only", default="")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()
    all_builders = builders()
    if args.list:
        print("\n".join(all_builders))
        return
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M = materials()
    names = [n for n in args.only.split(",") if n] or list(all_builders)
    roots = []
    catalog = {}
    over = []
    for n in names:
        t = time.time()
        root = all_builders[n](M)
        roots.append(root)
        tris = tri_count(root)
        cat = n.split("_")[0]
        meshes = [o for o in root.children_recursive if o.type == "MESH"]
        lo = Vector((math.inf,) * 3)
        hi = Vector((-math.inf,) * 3)
        for o in meshes:
            if o.name.startswith("COL_"):
                continue
            mw = o.matrix_world
            for vtx in o.data.vertices:
                w = mw @ vtx.co
                lo = Vector((min(lo.x, w.x), min(lo.y, w.y), min(lo.z, w.z)))
                hi = Vector((max(hi.x, w.x), max(hi.y, w.y), max(hi.z, w.z)))
        size = hi - lo
        catalog[n] = {"tris": tris, "draws": len([o for o in meshes if not o.name.startswith("COL_")]), "colliders": len([o for o in meshes if o.name.startswith("COL_")]), "size": [round(size.x, 2), round(size.y, 2), round(size.z, 2)], "min": [round(lo.x, 2), round(lo.y, 2), round(lo.z, 2)]}
        flag = ""
        if tris > BUDGET.get(cat, 99999):
            flag = "  ⚠ acima do orçamento"
            over.append(n)
        log(f"{n}: {tris} tri, {catalog[n]['draws']} malhas, {size.x:.1f}×{size.y:.1f}×{size.z:.1f} m ({time.time() - t:.1f}s){flag}")
    env.export(roots, args.out)
    with open(os.path.join(GEN, "catalogo.json"), "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=1)
    log(f"concluído em {time.time() - t0:.1f}s; {len(roots)} peças; acima do orçamento: {over or 'nenhuma'}")


if __name__ == "__main__":
    main()
