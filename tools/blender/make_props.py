"""
Props de gameplay (vertical slice) modelados no Blender (bpy) com os mesmos helpers do kit da praça:
  - pistola: pistola de serviço dos Custódios (ferrolho, armação, empunhadura, guarda-mato, gatilho,
    carregador, alças de mira). Origem no centro da empunhadura; cano para a frente (+Z no glTF).
  - caixa_municao: caixa metálica de munição com alça e etiqueta.
  - kit_medico: maleta de primeiros socorros com cruz.
Saída: public/assets/props/<nome>.glb

Uso: /usr/bin/python3.11 tools/blender/make_props.py
"""
import math
import os
import sys

import bpy  # noqa: F401

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_environment as env  # noqa: E402
from make_environment import box, cylinder, torus, cut, pbr, finish, export, _parts  # noqa: E402

OUT = os.path.join(env.REPO, "public", "assets", "props")


def log(*a):
    print("[make_props]", *a, flush=True)


def materials():
    return {
        "steel": pbr("gun_steel", color=(0.16, 0.17, 0.18), roughness=0.38, metallic=0.9),
        "polymer": pbr("gun_polymer", color=(0.09, 0.09, 0.1), roughness=0.85, metallic=0.0),
        "accent": pbr("gun_accent", color=(0.55, 0.5, 0.42), roughness=0.4, metallic=0.8),
        "sight": pbr("gun_sight", color=(0.9, 0.9, 0.85), roughness=0.5, emissive=(0.4, 1.0, 0.5), emissive_strength=0.8),
        "olive": pbr("box_olive", color=(0.24, 0.28, 0.2), roughness=0.75, metallic=0.4),
        "label": pbr("box_label", color=(0.85, 0.8, 0.66), roughness=0.9),
        "red": pbr("kit_red", color=(0.65, 0.12, 0.1), roughness=0.55),
        "white": pbr("kit_white", color=(0.9, 0.9, 0.86), roughness=0.5),
    }


def pistola(M):
    """Pistola compacta (~19 cm). Blender: cano para -Y, origem no centro da empunhadura."""
    start = len(_parts)
    # ferrolho (slide) com chanfro, acima da armação
    slide = box("ferrolho", (0.028, 0.175, 0.03), (0, -0.025, 0.055), M["steel"], bevel=0.004, segments=3)
    # serrilhas do ferrolho (sulcos)
    cutters = []
    for k in range(6):
        cutters.append(box(f"cut_serrilha_{k}", (0.03, 0.003, 0.012), (0, 0.045 + k * 0.006, 0.062), M["steel"]))
    # janela de ejeção e furo do cano
    cutters.append(box("cut_ejecao", (0.02, 0.03, 0.012), (0.012, -0.02, 0.064), M["steel"]))
    cutters.append(cylinder("cut_cano", 0.0055, 0.04, (0, -0.105, 0.058), M["steel"], segments=16, rot=(math.pi / 2, 0, 0)))
    cut(slide, cutters)
    # cano visível
    cylinder("cano", 0.005, 0.03, (0, -0.1, 0.058), M["accent"], segments=16, rot=(math.pi / 2, 0, 0))
    # armação (frame) e guarda-mato
    box("armacao", (0.026, 0.15, 0.022), (0, -0.015, 0.03), M["polymer"], bevel=0.003)
    box("trilho", (0.02, 0.05, 0.008), (0, -0.07, 0.016), M["polymer"], bevel=0.002)
    box("guarda_mato_frente", (0.006, 0.004, 0.03), (0, -0.04, 0.004), M["polymer"], bevel=0.001)
    box("guarda_mato_base", (0.006, 0.046, 0.004), (0, -0.018, -0.011), M["polymer"], bevel=0.001)
    box("gatilho", (0.005, 0.004, 0.018), (0, -0.015, 0.006), M["accent"], rot=(0.3, 0, 0), bevel=0.001)
    # empunhadura inclinada (origem aqui: a mão fecha em torno dela)
    box("empunhadura", (0.026, 0.034, 0.085), (0, 0.024, -0.02), M["polymer"], rot=(-0.28, 0, 0), bevel=0.004, segments=3)
    box("carregador_base", (0.028, 0.038, 0.008), (0, 0.036, -0.062), M["steel"], rot=(-0.28, 0, 0), bevel=0.002)
    # textura da empunhadura (sulcos)
    for k in range(5):
        box(f"sulco_{k}", (0.027, 0.002, 0.004), (0, 0.006 + k * 0.009, -0.025 + k * 0.0025), M["steel"], rot=(-0.28, 0, 0))
    # martelo/cauda e alças de mira
    box("cauda", (0.014, 0.012, 0.012), (0, 0.065, 0.045), M["steel"], bevel=0.002)
    box("alca_traseira", (0.014, 0.006, 0.006), (0, 0.055, 0.073), M["steel"], bevel=0.001)
    box("alca_frontal", (0.004, 0.006, 0.007), (0, -0.1, 0.073), M["steel"], bevel=0.001)
    box("ponto_mira", (0.002, 0.002, 0.002), (0, -0.102, 0.0775), M["sight"])
    for sx in (-0.004, 0.004):
        box(f"ponto_mira_t_{sx}", (0.002, 0.002, 0.002), (sx, 0.054, 0.0775), M["sight"])
    # pino do ferrolho / botão do carregador
    cylinder("botao_carregador", 0.004, 0.004, (-0.015, 0.0, 0.0), M["accent"], segments=12, rot=(0, math.pi / 2, 0))
    return finish(_parts[start:], "pistola")


def caixa_municao(M):
    """Caixa metálica de munição (30 × 18 × 20 cm) com alça e etiqueta."""
    start = len(_parts)
    body = box("corpo", (0.3, 0.18, 0.2), (0, 0, 0.1), M["olive"], bevel=0.008, segments=3)
    box("tampa", (0.31, 0.19, 0.03), (0, 0, 0.215), M["olive"], bevel=0.006)
    box("alca", (0.14, 0.02, 0.012), (0, 0, 0.245), M["accent"], bevel=0.003)
    for sx in (-0.06, 0.06):
        box(f"alca_pe_{sx}", (0.012, 0.02, 0.02), (sx, 0, 0.235), M["accent"])
    box("etiqueta", (0.16, 0.002, 0.08), (0, -0.091, 0.1), M["label"])
    box("fecho", (0.04, 0.01, 0.05), (0.1, -0.095, 0.17), M["accent"], bevel=0.002)
    void = body
    return finish(_parts[start:], "caixa_municao")


def kit_medico(M):
    """Maleta de primeiros socorros (28 × 12 × 20 cm) com cruz vermelha."""
    start = len(_parts)
    box("maleta", (0.28, 0.12, 0.2), (0, 0, 0.1), M["white"], bevel=0.01, segments=3)
    box("faixa", (0.29, 0.13, 0.03), (0, 0, 0.1), M["red"], bevel=0.004)
    box("cruz_v", (0.03, 0.004, 0.1), (0, -0.063, 0.1), M["red"])
    box("cruz_h", (0.1, 0.004, 0.03), (0, -0.063, 0.1), M["red"])
    box("alca", (0.1, 0.016, 0.014), (0, 0, 0.208), M["red"], bevel=0.004)
    for sx in (-0.05, 0.05):
        box(f"fecho_{sx}", (0.03, 0.008, 0.03), (sx, -0.062, 0.17), M["accent"], bevel=0.002)
    return finish(_parts[start:], "kit_medico")


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    _parts.clear()
    env._mats.clear()
    M = materials()
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (("pistola", pistola), ("caixa_municao", caixa_municao), ("kit_medico", kit_medico)):
        root = fn(M)
        export([root], os.path.join(OUT, f"{name}.glb"))
        bpy.data.objects.remove(root, do_unlink=True) if False else None
    log("concluído")


if __name__ == "__main__":
    main()
