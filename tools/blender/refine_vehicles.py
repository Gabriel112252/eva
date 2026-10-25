"""
Refino dos veículos da PR #1 (assets-src/vehicles/*.glb, gerados por tools/generate-eva-vehicles.mjs):
o gerador produz malhas corretas mas com cores chapadas, sem UVs e sem chanfros. Este script abre cada GLB
no Blender (módulo bpy) e:
  - troca os 16 materiais chapados por materiais PBR com textura (pintura gasta com riscos e sujeira,
    ferrugem, madeira, lona, borracha, vidro, lâmpadas emissivas);
  - gera UVs por projeção em caixa (escala por material) e suaviza por ângulo (arestas vivas preservadas);
  - adiciona chanfro (bevel) nas peças de chapa, para as arestas pegarem luz como num jogo comercial;
  - acrescenta detalhes aos três veículos terrestres (sinalizador e antena no Javali, pneus com banda,
    lona ondulada no Atlas/Módulo, placa de identificação);
  - junta as peças por material (menos draw calls) e exporta para public/assets/vehicles/<nome>.glb.

Uso: /usr/bin/python3.11 tools/blender/refine_vehicles.py [nome ...]
"""
import math
import os
import sys

import bpy  # noqa: F401  (precisa vir antes de bmesh)

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import make_environment as env  # noqa: E402
from make_environment import box, cylinder, torus, wavy_plane, pbr, textured_plain, generated_texture, drawn_texture, finish, export, _noise  # noqa: E402
from mathutils import Vector  # noqa: E402

REPO = env.REPO
SRC = os.path.join(REPO, "assets-src", "vehicles")
OUT = os.path.join(REPO, "public", "assets", "vehicles")
ALL = ["javali_vb4", "atlas_t3", "modulo_v7", "rastro_av4", "janus_station"]


def log(*a):
    print("[refine_vehicles]", *a, flush=True)


# ---------------------------------------------------------------------------
# Materiais
# ---------------------------------------------------------------------------
def paint_wear(x, y):
    """Pintura gasta: grão fino, riscos diagonais claros e manchas escuras de sujeira (textura neutra, tingida depois)."""
    n = _noise(math.floor(x * 512), math.floor(y * 512))
    n2 = _noise(math.floor(x * 48), math.floor(y * 48), 3)
    base = 0.86 + 0.08 * n + 0.06 * n2
    # riscos finos
    for k in range(7):
        ox = _noise(k, 11) * 1.0
        slope = 0.3 + 0.9 * _noise(k, 12)
        d = abs(((x - ox) * slope + y * 0.2 + _noise(k, 13)) % 0.37 - 0.18)
        if d < 0.0035 and _noise(math.floor(x * 200 + k), 5) > 0.45:
            base += 0.08
    # manchas de sujeira
    for k in range(5):
        cx, cy = _noise(k, 21), _noise(k, 22)
        r = 0.08 + 0.12 * _noise(k, 23)
        dd = math.hypot(x - cx, y - cy)
        if dd < r:
            base -= 0.09 * (1 - dd / r) * (0.5 + 0.5 * n2)
    v = int(255 * max(0, min(1, base)))
    return (v, v, v, 255)


def rust_tex(x, y):
    n = _noise(math.floor(x * 256), math.floor(y * 256))
    n2 = _noise(math.floor(x * 32), math.floor(y * 32), 7)
    n3 = _noise(math.floor(x * 8), math.floor(y * 8), 9)
    t = 0.35 * n + 0.4 * n2 + 0.25 * n3
    r = 0.30 + 0.45 * t
    g = 0.16 + 0.22 * t
    b = 0.08 + 0.10 * t
    return (int(255 * min(1, r)), int(255 * min(1, g)), int(255 * min(1, b)), 255)


def canvas_tex(x, y):
    weave = 0.5 + 0.5 * math.sin(x * 2 * math.pi * 64) * math.sin(y * 2 * math.pi * 64)
    n = _noise(math.floor(x * 64), math.floor(y * 64), 2)
    base = 0.72 + 0.1 * weave + 0.12 * n
    return (int(255 * min(1, base)), int(255 * min(1, base * 0.95)), int(255 * min(1, base * 0.82)), 255)


def tread_tex(x, y):
    """Banda de rodagem: blocos escuros com sulcos (usada no pneu via projeção em caixa)."""
    block = ((x * 24) % 1.0 < 0.78) and ((y * 6 + (math.floor(x * 24) % 2) * 0.5) % 1.0 < 0.8)
    v = 0.16 if block else 0.07
    v += 0.03 * _noise(math.floor(x * 256), math.floor(y * 256))
    return (int(255 * v), int(255 * v), int(255 * v), 255)


def materials():
    paint = generated_texture("paint_wear", 512, paint_wear)
    rust = generated_texture("rust_gen", 256, rust_tex)
    canvas = generated_texture("canvas", 256, canvas_tex)
    tread = generated_texture("tread", 256, tread_tex)

    def painted(name, tint, rough=0.55, metallic=0.1):
        m = textured_plain(name, paint, tile=1.1, roughness=rough, tint=tint)
        m.node_tree.nodes["Principled BSDF"].inputs["Metallic"].default_value = metallic
        return m

    return {
        "weathered_olive": painted("paint_olive", (0.22, 0.27, 0.20)),
        "soft_cream": painted("paint_cream", (0.80, 0.77, 0.66), rough=0.5),
        "worn_blue": painted("paint_blue", (0.28, 0.44, 0.58), rough=0.5),
        "rust_copper": textured_plain("rust_gen", rust, tile=0.6, roughness=0.95),
        "dark_steel": pbr("steel_dark", color=(0.17, 0.19, 0.21), roughness=0.5, metallic=0.75),
        "rubber_tire": textured_plain("tire", tread, tile=0.9, roughness=0.92),
        "matte_glass": pbr("glass_tinted", color=(0.10, 0.15, 0.18), roughness=0.08, metallic=0.0),
        "amber_lamp": pbr("lamp_amber", color=(0.9, 0.6, 0.2), roughness=0.3, emissive=(1.0, 0.62, 0.18), emissive_strength=1.6),
        "tail_red": pbr("lamp_red", color=(0.7, 0.1, 0.08), roughness=0.3, emissive=(1.0, 0.12, 0.08), emissive_strength=1.2),
        "tarp_sand": textured_plain("canvas_sand", canvas, tile=0.5, roughness=0.95, tint=(0.62, 0.52, 0.36)),
        "brushed_silver": pbr("metal_brushed", color=(0.6, 0.63, 0.63), roughness=0.4, metallic=0.9),
        "solar_blue": pbr("solar", color=(0.08, 0.16, 0.32), roughness=0.25, metallic=0.5),
        "white_ceramic": pbr("ceramic", color=(0.8, 0.82, 0.78), roughness=0.35),
        "warning_black": pbr("rubber_v", color=(0.05, 0.05, 0.05), roughness=0.9),
        "pale_gold": pbr("gold_v", color=(0.85, 0.66, 0.28), roughness=0.3, metallic=1.0),
    }


# ---------------------------------------------------------------------------
# Refino
# ---------------------------------------------------------------------------
def refine(name: str) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    env._parts.clear()
    env._mats.clear()
    env._images.clear()
    M = env.materials()  # madeira/lona/etc. do ambiente (mesmas texturas)
    V = materials()
    V["aged_wood"] = M["wood"]
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, f"{name}.glb"))
    objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        mat_name = o.data.materials[0].name if o.data.materials else ""
        key = mat_name.split(".")[0]
        new = V.get(key)
        if new is None:
            log(f"  material desconhecido {mat_name} em {o.name}; mantido")
            continue
        o.data.materials.clear()
        o.data.materials.append(new)
        env._parts.append(o)
        is_sheet = any(t in o.name for t in ("carroceria", "capo", "cabine", "porta", "painel", "chassi", "plataforma", "fundo", "lona", "bagageiro", "carga", "grade", "assento", "encosto", "caixa", "espelho", "farol", "lanterna", "luz", "pedal", "ripa", "radiador", "identific", "faixa", "trilho", "fuselagem", "carenagem"))
        if is_sheet and not any(t in o.name for t in ("vidro", "para_brisa", "parabrisa", "solar_painel", "helice")):
            mod = o.modifiers.new("bevel", "BEVEL")
            mod.width = 0.012
            mod.segments = 2
            mod.limit_method = "ANGLE"
            mod.angle_limit = math.radians(40)
    # detalhes extras nos três veículos terrestres
    # (no Blender a frente do veículo fica em -Y: o importador glTF converte +Z→-Y)
    if name == "javali_vb4":
        box("sinalizador_base", (0.9, 0.22, 0.08), (0, 0.0, 2.2), V["dark_steel"], bevel=0.01)
        box("sinalizador_luz", (0.8, 0.16, 0.1), (0, 0.0, 2.29), V["amber_lamp"], bevel=0.01)
        cylinder("antena", 0.012, 0.9, (-0.7, 1.2, 2.45), V["dark_steel"], segments=8)
        box("placa_frontal", (0.4, 0.02, 0.13), (-0.7, -2.33, 0.86), V["white_ceramic"], bevel=0.004)
        box("placa_traseira", (0.4, 0.02, 0.13), (0, 2.33, 0.95), V["white_ceramic"], bevel=0.004)
        for s in (-1, 1):
            box(f"para_lama_d_{s}", (0.22, 0.95, 0.3), (s * 1.08, -1.54, 1.1), V["warning_black"], bevel=0.02)
            box(f"para_lama_t_{s}", (0.22, 0.95, 0.3), (s * 1.08, 1.45, 1.1), V["warning_black"], bevel=0.02)
            box(f"estribo_{s}", (0.25, 1.87, 0.05), (s * 1.12, 0.215, 0.62), V["dark_steel"], bevel=0.006)
    elif name == "modulo_v7":
        box("placa_frontal", (0.4, 0.02, 0.13), (0, -2.6, 0.68), V["white_ceramic"], bevel=0.004)
        box("placa_traseira", (0.4, 0.02, 0.13), (0, 2.6, 0.95), V["white_ceramic"], bevel=0.004)
        for s in (-1, 1):
            box(f"espelho_{s}", (0.18, 0.12, 0.3), (s * 1.1, -1.9, 1.75), V["dark_steel"], bevel=0.01)
            cylinder(f"espelho_haste_{s}", 0.015, 0.2, (s * 1.0, -1.9, 1.75), V["dark_steel"], segments=8, rot=(0, math.pi / 2, 0))
        wavy_plane("lona_bagageiro", 1.5, 1.7, (0, 0.79, 2.56), V["tarp_sand"], nx=10, ny=10, amp=0.03, freq=2.0)
        cylinder("escapamento", 0.03, 0.6, (0.7, 2.4, 0.33), V["rust_copper"], segments=10, rot=(math.pi / 2, 0, 0))
    elif name == "atlas_t3":
        wavy_plane("lona_cobertura", 1.22, 1.22, (0, 0.76, 1.66), V["tarp_sand"], nx=10, ny=10, amp=0.03, freq=2.0)
        for k, (x, y, mat) in enumerate(((-0.22, 0.5, V["aged_wood"]), (0.2, 0.92, M["produce_brown"]), (0.22, 0.45, V["aged_wood"]))):
            box(f"carga_{k}", (0.42, 0.38, 0.30), (x, y, 0.97), mat, rot=(0, 0, k * 0.3), bevel=0.01)
    root = finish(list(env._parts), name)
    os.makedirs(OUT, exist_ok=True)
    export([root], os.path.join(OUT, f"{name}.glb"))


if __name__ == "__main__":
    names = [n for n in sys.argv[1:] if not n.startswith("-")] or ALL
    for n in names:
        refine(n)
    log("concluído")
