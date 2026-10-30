#!/usr/bin/env python3.11
"""
Gerador de personagens realistas para O Último Veto — EVA.

Executa no Blender headless (módulo `bpy` do PyPI) e usa apenas DADOS CC0 do MakeHuman
(malha base hm08, targets de morfologia, rig compatível com Mixamo + pesos, máscaras e olhos),
vendorizados em tools/blender/data/makehuman. Nenhum código do MakeHuman/MPFB é executado:
toda a lógica (parsing, morphing, rig, pele, roupas, acessórios, animação, export) é deste arquivo.

Saída: public/assets/characters/<nome>.glb — malha com pele bakeada, roupas, cabelo, olhos,
armature Mixamo (52 ossos) e clipes de animação esquelética (Idle, Walk, Run, ... ver retarget.GAME_CLIPS)
em trilhas NLA.

Roupas: camadas extraídas da própria pele (camisa/calça/botas) e, por especificação, peças volumétricas
projetadas sobre a malha em resolução cheia (BodySurface): tecido que cai reto (drape), vales preenchidos,
bordas cortadas por planos, uniforme (Brandão), jaqueta aberta/lenço/bolsa (Elias) e armadura segmentada
(Custódio). Peças do mesmo material são fundidas antes do export (cada malha = um draw call).

Uso:
  python3.11 tools/blender/make_character.py [--only brandao,elias] [--no-bake] [--tex 2048] [--out DIR]
  (--only regenera só as variantes pedidas e atualiza as entradas delas em characters.json)
"""
from __future__ import annotations

import argparse
import gzip
import json
import math
import os
import sys
import time

import bpy
import bmesh
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from mathutils.kdtree import KDTree

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data", "makehuman")
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
MH_SCALE = 0.1  # MakeHuman trabalha em decímetros
FPS = 30
TAU = math.pi * 2


def log(*a):
    print("[make_character]", *a, flush=True)


# ---------------------------------------------------------------------------
# Especificação dos personagens (cores sem marcas; valores canônicos em docs/)
# ---------------------------------------------------------------------------
CHARACTERS = {
    "matias": {
        "decimate": 1.0,
        "label": "Matias (58) — protagonista",
        "gender": 1.0, "age_years": 58, "race": {"african": 0.45, "caucasian": 0.45, "asian": 0.10},
        "muscle": 0.5, "weight": 0.52, "height": 1.76,
        "details": {"nose/nose-scale-horiz-incr": 0.25, "chin/chin-prominent-incr": 0.2, "mouth/mouth-laugh-lines-in": 0.4,
                    "cheek/l-cheek-volume-decr": 0.25, "cheek/r-cheek-volume-decr": 0.25, "head/head-oval": 0.3},
        "skin": "#8b5a3c", "hair": "#2a1e18", "hair_style": "short-wavy", "beard": 0.45, "eyebrows": 0.9, "gray_hair": 0.3,
        "glasses": True, "backpack": "#3b3a33", "toolbelt": True,
        "shirt": "#4a5663", "sleeves": "long", "pants": "#5a4a3b", "boots": "#2a2420",
    },
    "miriam": {
        "decimate": 0.6,
        "label": "Miriam (36) — arquivista da Apuração",
        "gender": 0.0, "age_years": 36, "race": {"african": 0.2, "caucasian": 0.7, "asian": 0.1},
        "muscle": 0.5, "weight": 0.48, "height": 1.68,
        "details": {"head/head-oval": 0.3},
        "skin": "#c99a78", "hair": "#3a2920", "hair_style": "bun", "beard": 0.0, "eyebrows": 0.7, "gray_hair": 0.0,
        "glasses": False, "headscarf": "#e9e2d2", "sash": "#b89036",
        "shirt": "#d8d0bf", "sleeves": "long", "pants": "#8a8176", "boots": "#3a332f",
    },
    "custodio": {
        "decimate": 0.6,
        "label": "Custódio da praça — segurança",
        "gender": 1.0, "age_years": 34, "race": {"african": 0.7, "caucasian": 0.25, "asian": 0.05},
        "muscle": 0.75, "weight": 0.6, "height": 1.83,
        "details": {"chin/chin-width-incr": 0.3, "head/head-square": 0.3},
        "skin": "#6a4832", "hair": "#111111", "hair_style": "buzz", "beard": 0.3, "eyebrows": 0.9, "gray_hair": 0.0,
        "glasses": False, "vest": "#272c45",
        "shirt": "#3b4552", "sleeves": "long", "pants": "#2d333d", "boots": "#17191d", "sole": "#17191d",
        "drape": {"legs": True},
        # equipamento de proteção humano e fabricável (docs/DIRECAO_ARTE.md): cerâmica balística segmentada,
        # polímero moldado, tecido reforçado, capacete com viseira levantada; cinza-azulado + índigo/cobre
        "armor": {"plate": "#66778a", "trim": "#b06a3b", "indigo": "#323c78", "visor": "#1b2330"},
    },
    "brandao": {
        "decimate": 0.6,
        "label": "Samuel Brandão (44) — oficial de saída do depósito",
        "gender": 1.0, "age_years": 44, "race": {"african": 0.2, "caucasian": 0.7, "asian": 0.1},
        "muscle": 0.4, "weight": 0.68, "height": 1.74,
        "details": {"mouth/mouth-angles-down": 0.45, "eyebrows/eyebrows-angle-down": 0.35, "head/head-fat-incr": 0.3,
                    "nose/nose-volume-incr": 0.3, "mouth/mouth-laugh-lines-in": 0.35, "head/head-square": 0.15},
        "skin": "#b07f5e", "hair": "#2e2622", "hair_style": "short-wavy", "beard": 0.3, "eyebrows": 0.9, "gray_hair": 0.35,
        "glasses": False,
        # farda cinza de oficial de distribuição (sem armadura): túnica até o quadril, gola alta, dragonas,
        # bolsos de peito, cinto, faixa de cobre no braço, insígnia geométrica, crachá e prancheta
        "shirt": "#777b80", "sleeves": "long", "pants": "#53575d", "boots": "#1c1b1a", "sole": "#1c1b1a",
        "shirt_offset": 0.019, "pants_offset": 0.013, "shirt_hem": -0.115,
        "drape": {"torso": True, "legs": True, "cuffs": True},
        "uniform": {"collar": "#6f7378", "trim": "#b06a3b", "button": "#2a2b2e", "indigo": "#2c3360"},
        "clipboard": True,
    },
    "elias": {
        "decimate": 0.6,
        "label": "Elias Nobre (24) — mensageiro dos Silenciosos",
        "gender": 1.0, "age_years": 24, "race": {"african": 0.5, "caucasian": 0.3, "asian": 0.2},
        "muscle": 0.55, "weight": 0.36, "height": 1.79,
        "details": {"cheek/l-cheek-bones-incr": 0.4, "cheek/r-cheek-bones-incr": 0.4, "chin/chin-prominent-incr": 0.25,
                    "nose/nose-scale-horiz-decr": 0.2, "head/head-oval": 0.35, "mouth/mouth-scale-horiz-decr": 0.15},
        "skin": "#7d553a", "hair": "#120d0a", "hair_style": "short-wavy", "beard": 0.12, "eyebrows": 0.85, "gray_hair": 0.0,
        "glasses": False,
        # mensageiro: camiseta clara sob jaqueta leve gasta e aberta (com capuz), lenço no pescoço,
        # bolsa transversal com documentos, tênis de sola clara
        "shirt": "#cdc5b2", "sleeves": "long", "pants": "#2c3038", "boots": "#3b3530", "sole": "#cfc8b8",
        "pants_offset": 0.011,
        "drape": {"legs": True},
        "jacket": {"color": "#5e6247", "offset": 0.021, "hem": -0.075, "open": 0.05, "hood": True, "patches": "#474a36"},
        "scarf": "#8e4a35",
        "crossbody_bag": {"color": "#4a3a2a", "strap": "#3a2e22", "papers": "#e6dcc4", "buckle": "#8a8f94"},
    },
    "saqueador_a": {
        "decimate": 0.6,
        "label": "Saqueador (desviador de cargas) — variante A",
        "gender": 1.0, "age_years": 29, "race": {"african": 0.35, "caucasian": 0.55, "asian": 0.10},
        "muscle": 0.65, "weight": 0.5, "height": 1.78,
        "details": {"head/head-square": 0.2, "chin/chin-width-incr": 0.2},
        "skin": "#9a6b4b", "hair": "#1a1410", "hair_style": "cap", "beard": 0.6, "eyebrows": 0.9, "gray_hair": 0.0,
        "glasses": False, "cap": "#4a3b2a", "vest": "#3a2f2a",
        "shirt": "#6b5a3e", "sleeves": "long", "pants": "#2f2b26", "boots": "#1e1b18",
    },
    "saqueador_b": {
        "decimate": 0.6,
        "label": "Saqueador (desviador de cargas) — variante B",
        "gender": 1.0, "age_years": 41, "race": {"african": 0.6, "caucasian": 0.3, "asian": 0.10},
        "muscle": 0.55, "weight": 0.62, "height": 1.74,
        "details": {"head/head-round": 0.25, "nose/nose-scale-horiz-incr": 0.2},
        "skin": "#6e4a35", "hair": "#0f0c0a", "hair_style": "short-wavy", "beard": 0.2, "eyebrows": 0.8, "gray_hair": 0.2,
        "glasses": False, "headscarf": "#7a2a24",
        "shirt": "#3c4a52", "sleeves": "short", "pants": "#4a3f33", "boots": "#262220",
    },
    "comerciante": {
        "decimate": 0.6,
        "label": "Comerciante do bairro",
        "gender": 1.0, "age_years": 52, "race": {"african": 0.3, "caucasian": 0.6, "asian": 0.1},
        "muscle": 0.4, "weight": 0.66, "height": 1.70,
        "details": {"head/head-round": 0.3, "mouth/mouth-laugh-lines-in": 0.3},
        "skin": "#a3714f", "hair": "#6f6a62", "hair_style": "short-wavy", "beard": 0.5, "eyebrows": 0.8, "gray_hair": 0.7,
        "glasses": False, "apron": "#d6cdbc",
        "shirt": "#8c3b2f", "sleeves": "short", "pants": "#44403a", "boots": "#2a2622",
    },
    "raquel": {
        "decimate": 0.6,
        "label": "Raquel (40) — médica da comunidade",
        "gender": 0.0, "age_years": 40, "race": {"african": 0.75, "caucasian": 0.2, "asian": 0.05},
        "muscle": 0.5, "weight": 0.45, "height": 1.65,
        "details": {"head/head-oval": 0.4},
        "skin": "#5c3e2d", "hair": "#0e0a08", "hair_style": "bun", "beard": 0.0, "eyebrows": 0.8, "gray_hair": 0.0,
        "glasses": False, "coat": "#ece9e2",
        "shirt": "#e8e4dc", "sleeves": "long", "pants": "#3f4b57", "boots": "#242424",
    },
    "ana": {
        "decimate": 0.6,
        "label": "Ana (15) — filha de Matias",
        "gender": 0.0, "age_years": 15, "race": {"african": 0.4, "caucasian": 0.5, "asian": 0.1},
        "muscle": 0.45, "weight": 0.42, "height": 1.60,
        "details": {},
        "skin": "#9a6a4a", "hair": "#2a1c16", "hair_style": "ponytail", "beard": 0.0, "eyebrows": 0.7, "gray_hair": 0.0,
        "glasses": False,
        "shirt": "#6b7fa3", "sleeves": "short", "pants": "#3a4048", "boots": "#333333",
    },
}

# Ossos do rig Mixamo usados pela animação procedural (mapeados a partir do rig simples anterior)
B = {
    "Hips": "mixamorig:Hips", "Spine": "mixamorig:Spine", "Spine1": "mixamorig:Spine1", "Chest": "mixamorig:Spine2",
    "Neck": "mixamorig:Neck", "Head": "mixamorig:Head",
    "LeftShoulder": "mixamorig:LeftShoulder", "LeftUpperArm": "mixamorig:LeftArm", "LeftLowerArm": "mixamorig:LeftForeArm", "LeftHand": "mixamorig:LeftHand",
    "RightShoulder": "mixamorig:RightShoulder", "RightUpperArm": "mixamorig:RightArm", "RightLowerArm": "mixamorig:RightForeArm", "RightHand": "mixamorig:RightHand",
    "LeftUpperLeg": "mixamorig:LeftUpLeg", "LeftLowerLeg": "mixamorig:LeftLeg", "LeftFoot": "mixamorig:LeftFoot",
    "RightUpperLeg": "mixamorig:RightUpLeg", "RightLowerLeg": "mixamorig:RightLeg", "RightFoot": "mixamorig:RightFoot",
}
SHIRT_BONES = {"mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2", "mixamorig:LeftShoulder", "mixamorig:RightShoulder",
               "mixamorig:LeftArm", "mixamorig:RightArm", "mixamorig:LeftForeArm", "mixamorig:RightForeArm"}
SHORT_SLEEVE_EXCLUDE = {"mixamorig:LeftForeArm", "mixamorig:RightForeArm"}
PANTS_BONES = {"mixamorig:Hips", "mixamorig:LeftUpLeg", "mixamorig:RightUpLeg", "mixamorig:LeftLeg", "mixamorig:RightLeg"}
BOOT_BONES = {"mixamorig:LeftFoot", "mixamorig:RightFoot", "mixamorig:LeftToeBase", "mixamorig:RightToeBase"}


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def hex_to_linear(h: str):
    h = h.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


def mh_vec(x: float, y: float, z: float) -> Vector:
    """MakeHuman (dm, Y para cima, +Z frente) -> Blender (m, Z para cima, -Y frente)."""
    return Vector((x * MH_SCALE, -z * MH_SCALE, y * MH_SCALE))


def smoothstep(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------------------
# Dados MakeHuman
# ---------------------------------------------------------------------------
class BaseMesh:
    def __init__(self, path: str):
        self.verts: list[Vector] = []
        self.uvs: list[tuple[float, float]] = []
        self.faces: dict[str, list[tuple[list[int], list[int]]]] = {}
        group = "default"
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                if line.startswith("v "):
                    _, x, y, z = line.split()[:4]
                    self.verts.append(mh_vec(float(x), float(y), float(z)))
                elif line.startswith("vt "):
                    _, u, v = line.split()[:3]
                    self.uvs.append((float(u), float(v)))
                elif line.startswith("g "):
                    group = line[2:].strip()
                    self.faces.setdefault(group, [])
                elif line.startswith("f "):
                    vi, ti = [], []
                    for part in line.split()[1:]:
                        comps = part.split("/")
                        vi.append(int(comps[0]) - 1)
                        ti.append(int(comps[1]) - 1 if len(comps) > 1 and comps[1] else -1)
                    self.faces.setdefault(group, []).append((vi, ti))
        log(f"base.obj: {len(self.verts)} vértices, {len(self.uvs)} uvs, grupos={len(self.faces)}")

    def group_faces(self, prefix: str):
        out = []
        for g, faces in self.faces.items():
            if g == prefix or g.startswith(prefix):
                out.extend(faces)
        return out


def load_vertex_groups():
    with open(os.path.join(DATA, "mesh_metadata", "basemesh_vertex_groups.json"), "r", encoding="utf-8") as f:
        return json.load(f)


def group_indices(vgroups, name: str) -> list[int]:
    out = []
    for a, b in vgroups[name]:
        out.extend(range(a, b + 1))
    return out


def load_target(path: str) -> list[tuple[int, Vector]]:
    out = []
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as f:
        for line in f:
            if not line.strip() or line.startswith("#"):
                continue
            idx, dx, dy, dz = line.split()[:4]
            out.append((int(idx), mh_vec(float(dx), float(dy), float(dz))))
    return out


def apply_target(verts: list[Vector], target: list[tuple[int, Vector]], weight: float):
    if abs(weight) < 1e-4:
        return
    for idx, d in target:
        if idx < len(verts):
            verts[idx] = verts[idx] + d * weight


def macro_weights(value: float, parts: list[tuple[float, float, str, str]]) -> dict[str, float]:
    """Pesos de um macro-target (ex.: idade) conforme as faixas do MakeHuman."""
    for lowest, highest, low, high in parts:
        if lowest <= value <= highest:
            t = (value - lowest) / (highest - lowest)
            return {low: 1 - t, high: t}
    # fora da faixa: extremo mais próximo
    if value < parts[0][0]:
        return {parts[0][2]: 1.0}
    return {parts[-1][3]: 1.0}


AGE_PARTS = [(-0.01, 0.1874998, "baby", "child"), (0.1874999, 0.49998, "child", "young"), (0.49999, 1.01, "young", "old")]
MUSCLE_PARTS = [(-0.01, 0.49998, "minmuscle", "averagemuscle"), (0.49999, 1.01, "averagemuscle", "maxmuscle")]
WEIGHT_PARTS = [(-0.01, 0.49998, "minweight", "averageweight"), (0.49999, 1.01, "averageweight", "maxweight")]


def age_years_to_value(years: float) -> float:
    """Escala de idade do MakeHuman: 0=1 ano, 0.1875=11, 0.5=25, 1=90."""
    if years <= 11:
        return max(0.0, (years - 1) / 10.0 * 0.1875)
    if years <= 25:
        return 0.1875 + (years - 11) / 14.0 * (0.5 - 0.1875)
    return 0.5 + (years - 25) / 65.0 * 0.5


def morph(base: BaseMesh, spec: dict) -> list[Vector]:
    verts = [v.copy() for v in base.verts]
    gender = "male" if spec["gender"] >= 0.5 else "female"
    ages = macro_weights(age_years_to_value(spec["age_years"]), AGE_PARTS)
    muscles = macro_weights(spec["muscle"], MUSCLE_PARTS)
    weights = macro_weights(spec["weight"], WEIGHT_PARTS)
    cache: dict[str, list] = {}

    def tgt(rel: str):
        if rel not in cache:
            p = os.path.join(DATA, "targets", rel + ".target.gz")
            cache[rel] = load_target(p) if os.path.exists(p) else []
        return cache[rel]

    # raça × gênero × idade
    for race, wr in spec["race"].items():
        for age, wa in ages.items():
            apply_target(verts, tgt(f"macrodetails/{race}-{gender}-{age}"), wr * wa)
    # universal: gênero × idade × musculatura × peso (os average/average são vazios)
    for age, wa in ages.items():
        for m, wm in muscles.items():
            for w, ww in weights.items():
                apply_target(verts, tgt(f"macrodetails/universal-{gender}-{age}-{m}-{w}"), wa * wm * ww)
    # detalhes
    for rel, value in spec.get("details", {}).items():
        apply_target(verts, tgt("details/" + rel), value)
    return verts


# ---------------------------------------------------------------------------
# Construção de objetos Blender
# ---------------------------------------------------------------------------
def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.unit_settings.system = "METRIC"


def make_mesh_object(name: str, verts: list[Vector], faces: list[tuple[list[int], list[int]]], uvs, remap: dict[int, int] | None = None):
    """Cria um objeto a partir de faces (índices globais) e UVs do base.obj. Retorna (obj, map global->local)."""
    if remap is None:
        remap = {}
        for vi, _ in faces:
            for i in vi:
                if i not in remap:
                    remap[i] = len(remap)
    local_verts = [None] * len(remap)
    for g, l in remap.items():
        local_verts[l] = verts[g]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in local_verts], [], [[remap[i] for i in vi] for vi, _ in faces])
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    loop_i = 0
    for poly, (vi, ti) in zip(mesh.polygons, faces):
        for k in range(len(vi)):
            u, v = uvs[ti[k]] if ti[k] >= 0 else (0.0, 0.0)
            uv_layer.data[poly.loop_start + k].uv = (u, v)
            loop_i += 1
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj, remap


def build_armature(name: str, verts: list[Vector], vgroups, scale: float):
    with open(os.path.join(DATA, "rigs", "rig.mixamo.json"), "r", encoding="utf-8") as f:
        rig = json.load(f)
    bones = rig["bones"]

    def joint_pos(d: dict) -> Vector:
        if d["strategy"] == "CUBE":
            idx = group_indices(vgroups, d["cube_name"])
        else:
            idx = d["vertex_indices"]
        p = Vector((0, 0, 0))
        for i in idx:
            p += verts[i]
        return p / len(idx)

    arm_data = bpy.data.armatures.new(name)
    arm = bpy.data.objects.new(name, arm_data)
    bpy.context.scene.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="EDIT")
    created = {}
    order = []
    remaining = dict(bones)
    while remaining:
        progressed = False
        for bname, bdef in list(remaining.items()):
            parent = bdef.get("parent", "")
            if not parent or parent in created:
                order.append(bname)
                eb = arm_data.edit_bones.new(bname)
                eb.head = joint_pos(bdef["head"]) * scale
                eb.tail = joint_pos(bdef["tail"]) * scale
                if (eb.tail - eb.head).length < 0.005:
                    eb.tail = eb.head + Vector((0, 0, 0.02))
                eb.roll = bdef.get("roll", 0.0)
                eb.use_connect = False
                eb.use_inherit_rotation = True
                eb.inherit_scale = "FULL"
                if parent:
                    eb.parent = created[parent]
                created[bname] = eb
                del remaining[bname]
                progressed = True
        if not progressed:
            raise RuntimeError(f"Hierarquia de ossos inconsistente: {list(remaining)[:5]}")
    bpy.ops.object.mode_set(mode="OBJECT")
    joints = {k: v for k, v in created.items()}
    positions = {b: arm_data.bones[b].head_local.copy() for b in bones}
    return arm, positions


def load_weights():
    with open(os.path.join(DATA, "rigs", "weights.mixamo.json"), "r", encoding="utf-8") as f:
        return json.load(f)["weights"]


def assign_weights(obj, remap: dict[int, int], weights: dict[str, list]):
    """Cria vertex groups (nomes dos ossos) a partir dos pesos do MakeHuman, normalizando por vértice."""
    per_vertex: dict[int, list[tuple[str, float]]] = {}
    for bone, entries in weights.items():
        for gi, w in entries:
            if gi in remap and w > 1e-5:
                per_vertex.setdefault(remap[gi], []).append((bone, w))
    groups = {}
    for li, entries in per_vertex.items():
        total = sum(w for _, w in entries)
        for bone, w in entries:
            vg = groups.get(bone)
            if vg is None:
                vg = obj.vertex_groups.new(name=bone)
                groups[bone] = vg
            vg.add([li], w / total, "REPLACE")
    # vértices sem peso: cola no quadril
    hips = groups.get("mixamorig:Hips") or obj.vertex_groups.new(name="mixamorig:Hips")
    for li in range(len(obj.data.vertices)):
        if li not in per_vertex:
            hips.add([li], 1.0, "REPLACE")


def assign_single_bone(obj, bone: str):
    vg = obj.vertex_groups.new(name=bone)
    vg.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")


def parent_to_armature(obj, arm):
    obj.parent = arm
    mod = obj.modifiers.new("Armature", "ARMATURE")
    mod.object = arm


def dominant_region(obj, weights_local: dict[int, dict[str, float]], sleeves: str):
    """Classifica cada vértice local em 'shirt' | 'pants' | 'boots' | 'skin' pelos pesos dominantes."""
    shirt = SHIRT_BONES - (SHORT_SLEEVE_EXCLUDE if sleeves == "short" else set())
    region = {}
    for li, bw in weights_local.items():
        s = sum(w for b, w in bw.items() if b in shirt)
        p = sum(w for b, w in bw.items() if b in PANTS_BONES)
        bt = sum(w for b, w in bw.items() if b in BOOT_BONES)
        best = max(("shirt", s), ("pants", p), ("boots", bt), key=lambda t: t[1])
        # na barriga os pesos dividem-se entre Spine e Hips (nenhum chega a 0,5): basta a região dominante
        region[li] = best[0] if best[1] >= 0.3 else "skin"
    return region


def local_weights(obj) -> dict[int, dict[str, float]]:
    names = {vg.index: vg.name for vg in obj.vertex_groups}
    out = {}
    for v in obj.data.vertices:
        out[v.index] = {names[g.group]: g.weight for g in v.groups}
    return out


def extract_faces(src_obj, face_indices: list[int], name: str, offset: float, smooth_edges: bool = True):
    """Duplica faces (com UVs e pesos) para um novo objeto, deslocando ao longo das normais."""
    src = src_obj.data
    src.calc_normals_split() if hasattr(src, "calc_normals_split") else None
    vnormals = {v.index: v.normal.copy() for v in src.vertices}
    used = {}
    for fi in face_indices:
        for vi in src.polygons[fi].vertices:
            if vi not in used:
                used[vi] = len(used)
    verts = [None] * len(used)
    for vi, li in used.items():
        verts[li] = src.vertices[vi].co + vnormals[vi] * offset
    faces = []
    uvs = []
    uv_src = src.uv_layers.active.data
    for fi in face_indices:
        p = src.polygons[fi]
        faces.append([used[vi] for vi in p.vertices])
        uvs.append([tuple(uv_src[p.loop_start + k].uv) for k in range(len(p.vertices))])
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in verts], [], faces)
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for poly, fuv in zip(mesh.polygons, uvs):
        for k in range(len(fuv)):
            uv_layer.data[poly.loop_start + k].uv = fuv[k]
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if smooth_edges:
        smooth_boundary(obj, 6, 0.5)
    # pesos
    src_names = {vg.index: vg.name for vg in src_obj.vertex_groups}
    groups = {}
    for vi, li in used.items():
        for g in src.vertices[vi].groups:
            bname = src_names[g.group]
            vg = groups.get(bname)
            if vg is None:
                vg = obj.vertex_groups.new(name=bname)
                groups[bname] = vg
            vg.add([li], g.weight, "REPLACE")
    return obj


def smooth_boundary(obj, iterations=5, factor=0.5):
    """Suaviza só o contorno aberto (bainhas/golas) para tirar o serrilhado da seleção por faces."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    boundary = [v for v in bm.verts if any(e.is_boundary for e in v.link_edges)]
    for _ in range(iterations):
        bmesh.ops.smooth_vert(bm, verts=boundary, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def smooth_mesh(obj, iterations=10, factor=0.5):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for _ in range(iterations):
        bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=factor, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def delete_faces(obj, face_indices: set[int]):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.faces.ensure_lookup_table()
    doomed = [bm.faces[i] for i in face_indices]
    bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


# ---------------------------------------------------------------------------
# Materiais
# ---------------------------------------------------------------------------
def simple_material(name: str, color: str, roughness=0.8, metallic=0.0, alpha=1.0, emissive=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = hex_to_linear(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        mat.surface_render_method = "BLENDED"
        mat.blend_method = "BLEND"
    if emissive:
        bsdf.inputs["Emission Color"].default_value = hex_to_linear(emissive)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    return mat


def fabric_material(name: str, color: str, roughness=0.85, scale=90.0, contrast=0.08):
    """Tecido: cor base com variação fina de ruído (bakeada? não — fica procedural e é exportada só a cor base).
    O glTF não carrega nós procedurais; a textura de tecido é bakeada em `bake_object` se solicitado."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 4.0
    noise.inputs["Roughness"].default_value = 0.6
    ramp = nodes.new("ShaderNodeValToRGB")
    c = hex_to_linear(color)
    ramp.color_ramp.elements[0].color = (c[0] * (1 - contrast), c[1] * (1 - contrast), c[2] * (1 - contrast), 1)
    ramp.color_ramp.elements[1].color = (min(1, c[0] * (1 + contrast)), min(1, c[1] * (1 + contrast)), min(1, c[2] * (1 + contrast)), 1)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    mat["eva_base_color"] = color
    return mat


def load_image(path: str, colorspace="Non-Color"):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def skin_material(name: str, spec: dict):
    """Pele procedural: tom base + variação + máscaras CC0 (lábios, pálpebras, boca, unhas) + sobrancelhas/barba por vertex color."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.5
    bsdf.inputs["Subsurface Weight"].default_value = 0.0

    skin = hex_to_linear(spec["skin"])
    hair = hex_to_linear(spec["hair"])
    base = nodes.new("ShaderNodeRGB")
    base.outputs[0].default_value = skin

    # variação orgânica (manchas suaves + poros finos)
    noise1 = nodes.new("ShaderNodeTexNoise")
    noise1.inputs["Scale"].default_value = 14.0
    noise1.inputs["Detail"].default_value = 3.0
    noise2 = nodes.new("ShaderNodeTexNoise")
    noise2.inputs["Scale"].default_value = 180.0
    noise2.inputs["Detail"].default_value = 2.0
    mix_var = nodes.new("ShaderNodeMix")
    mix_var.data_type = "RGBA"
    mix_var.blend_type = "MULTIPLY"
    mix_var.inputs["Factor"].default_value = 0.18
    ramp_var = nodes.new("ShaderNodeValToRGB")
    ramp_var.color_ramp.elements[0].color = (0.78, 0.7, 0.68, 1)
    ramp_var.color_ramp.elements[1].color = (1.15, 1.1, 1.08, 1)
    math_add = nodes.new("ShaderNodeMath")
    math_add.operation = "ADD"
    links.new(noise1.outputs["Fac"], math_add.inputs[0])
    links.new(noise2.outputs["Fac"], math_add.inputs[1])
    math_mul = nodes.new("ShaderNodeMath")
    math_mul.operation = "MULTIPLY"
    math_mul.inputs[1].default_value = 0.5
    links.new(math_add.outputs[0], math_mul.inputs[0])
    links.new(math_mul.outputs[0], ramp_var.inputs["Fac"])
    links.new(base.outputs[0], mix_var.inputs["A"])
    links.new(ramp_var.outputs["Color"], mix_var.inputs["B"])
    current = mix_var.outputs["Result"]

    def mask_tex(fname):
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = load_image(os.path.join(DATA, "textures", fname))
        tex.interpolation = "Linear"
        return tex

    def mix_with(color, factor_output, strength=1.0, blend="MIX"):
        nonlocal current
        m = nodes.new("ShaderNodeMix")
        m.data_type = "RGBA"
        m.blend_type = blend
        scale = nodes.new("ShaderNodeMath")
        scale.operation = "MULTIPLY"
        scale.inputs[1].default_value = strength
        links.new(factor_output, scale.inputs[0])
        links.new(scale.outputs[0], m.inputs["Factor"])
        links.new(current, m.inputs["A"])
        rgb = nodes.new("ShaderNodeRGB")
        rgb.outputs[0].default_value = color
        links.new(rgb.outputs[0], m.inputs["B"])
        current = m.outputs["Result"]

    # lábios: mais escuros/avermelhados
    lips = mask_tex("mpfb_lips.jpg")
    mix_with((skin[0] * 0.9, skin[1] * 0.55, skin[2] * 0.5, 1), lips.outputs["Color"], 0.75)
    # pálpebras: leve escurecimento
    lids = mask_tex("mpfb_eyelids.jpg")
    mix_with((skin[0] * 0.75, skin[1] * 0.65, skin[2] * 0.62, 1), lids.outputs["Color"], 0.5)
    # interior da boca
    mouth = mask_tex("mpfb_inside-mouth.jpg")
    mix_with((0.06, 0.02, 0.02, 1), mouth.outputs["Color"], 1.0)
    # unhas
    nails = mask_tex("mpfb_fingernails.jpg")
    mix_with((min(1, skin[0] * 1.25 + 0.05), min(1, skin[1] * 1.2 + 0.05), min(1, skin[2] * 1.15 + 0.05), 1), nails.outputs["Color"], 0.8)
    toenails = mask_tex("mpfb_toenails.jpg")
    mix_with((min(1, skin[0] * 1.25 + 0.05), min(1, skin[1] * 1.2 + 0.05), min(1, skin[2] * 1.15 + 0.05), 1), toenails.outputs["Color"], 0.8)

    # sobrancelhas e barba via atributos de vértice
    strand = nodes.new("ShaderNodeTexNoise")
    strand.inputs["Scale"].default_value = 400.0
    strand.inputs["Detail"].default_value = 1.0
    strand_ramp = nodes.new("ShaderNodeValToRGB")
    strand_ramp.color_ramp.elements[0].position = 0.22
    strand_ramp.color_ramp.elements[1].position = 0.55
    links.new(strand.outputs["Fac"], strand_ramp.inputs["Fac"])

    def vcol_mask(attr_name, strength, color):
        attr = nodes.new("ShaderNodeAttribute")
        attr.attribute_name = attr_name
        mul = nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        links.new(attr.outputs["Fac"], mul.inputs[0])
        links.new(strand_ramp.outputs["Color"], mul.inputs[1])
        mix_with(color, mul.outputs[0], strength)

    brow_color = (hair[0] * 0.8, hair[1] * 0.8, hair[2] * 0.8, 1)
    vcol_mask("mask_brow", spec.get("eyebrows", 0.8) * 1.5, brow_color)
    if spec.get("beard", 0) > 0:
        beard_color = (skin[0] * 0.35 + hair[0] * 0.3, skin[1] * 0.35 + hair[1] * 0.3, skin[2] * 0.35 + hair[2] * 0.3, 1)
        vcol_mask("mask_beard", spec["beard"] * 1.3, beard_color)

    links.new(current, bsdf.inputs["Base Color"])
    # saída de rugosidade: lábios um pouco mais brilhantes
    return mat


def bake_object_color(obj, size: int, name: str, out_png: str):
    """Faz o bake da cor base (DIFFUSE/COLOR, sem iluminação) de todos os materiais do objeto para uma imagem."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 4
    scene.cycles.use_denoising = False
    bake = scene.render.bake
    bake.use_pass_direct = False
    bake.use_pass_indirect = False
    bake.use_pass_color = True
    bake.margin = 12
    bake.use_clear = True
    img = bpy.data.images.new(name, width=size, height=size, alpha=False)
    img.colorspace_settings.name = "sRGB"
    tex_nodes = []
    for slot in obj.material_slots:
        mat = slot.material
        nt = mat.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = img
        nt.nodes.active = tex
        tex_nodes.append((nt, tex))
    for o in bpy.context.scene.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    t = time.time()
    with bpy.context.temp_override(selected_objects=[obj], active_object=obj, object=obj):
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, margin=12, use_clear=True)
    log(f"bake {name}: {size}px em {time.time() - t:.1f}s")
    img.filepath_raw = out_png
    img.file_format = "PNG"
    img.save()
    for nt, tex in tex_nodes:
        nt.nodes.remove(tex)
    return img


def replace_with_baked(obj, img, roughness=0.5, name="baked"):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = roughness
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


# ---------------------------------------------------------------------------
# Acessórios (primitivas) — todos pesados a um único osso
# ---------------------------------------------------------------------------
def add_primitive(kind: str, name: str, location: Vector, scale=(1, 1, 1), rotation=(0, 0, 0), **kw):
    if kind == "cube":
        bpy.ops.mesh.primitive_cube_add(size=1.0, location=location, rotation=rotation)
    elif kind == "cylinder":
        bpy.ops.mesh.primitive_cylinder_add(radius=0.5, depth=1.0, vertices=kw.get("vertices", 16), location=location, rotation=rotation)
    elif kind == "sphere":
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5, segments=kw.get("segments", 20), ring_count=kw.get("rings", 12), location=location, rotation=rotation)
    elif kind == "torus":
        bpy.ops.mesh.primitive_torus_add(major_radius=kw.get("major", 0.02), minor_radius=kw.get("minor", 0.002), major_segments=kw.get("major_segments", 28), minor_segments=kw.get("minor_segments", 8), location=location, rotation=rotation)
    elif kind == "circle":
        bpy.ops.mesh.primitive_circle_add(radius=0.5, vertices=kw.get("vertices", 24), fill_type="NGON", location=location, rotation=rotation)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for p in obj.data.polygons:
        p.use_smooth = kind in ("cylinder", "sphere", "torus")
    return obj


def bevel(obj, width=0.01, segments=3):
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in obj.data.polygons:
        p.use_smooth = True


def set_material(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


# ---------------------------------------------------------------------------
# Animação procedural no rig Mixamo
# ---------------------------------------------------------------------------
def rest_pose_lib():
    def rest():
        return {k: [0.0, 0.0, 0.0] for k in B}

    def add(pose, bone, rx=0.0, ry=0.0, rz=0.0):
        pose[bone][0] += rx
        pose[bone][1] += ry
        pose[bone][2] += rz

    def relaxed_arms(pose, spread=7.0):
        add(pose, "LeftUpperArm", 0, 0, spread)
        add(pose, "RightUpperArm", 0, 0, -spread)
        add(pose, "LeftLowerArm", -10)
        add(pose, "RightLowerArm", -10)

    def gait(p, leg_amp, knee_amp, arm_amp, elbow, lean, bob, twist):
        pose = rest()
        s = math.sin(TAU * p)
        add(pose, "LeftUpperLeg", -leg_amp * s)
        add(pose, "RightUpperLeg", leg_amp * s)
        knee_l = knee_amp * max(0.0, math.sin(TAU * (p - 0.7))) + 4
        knee_r = knee_amp * max(0.0, math.sin(TAU * (p - 0.2))) + 4
        add(pose, "LeftLowerLeg", knee_l)
        add(pose, "RightLowerLeg", knee_r)
        add(pose, "LeftFoot", -knee_l * 0.35 + leg_amp * s * 0.25)
        add(pose, "RightFoot", -knee_r * 0.35 - leg_amp * s * 0.25)
        add(pose, "LeftUpperArm", arm_amp * s, 0, 6)
        add(pose, "RightUpperArm", -arm_amp * s, 0, -6)
        add(pose, "LeftLowerArm", elbow - 8 * max(0.0, s))
        add(pose, "RightLowerArm", elbow - 8 * max(0.0, -s))
        add(pose, "Spine", lean * 0.6)
        add(pose, "Chest", lean * 0.4, -twist * s, 0)
        add(pose, "Hips", 0, twist * s, 0)
        add(pose, "Head", -lean * 0.5, twist * 0.3 * s, 0)
        pose["hips_offset"] = [0.0, -bob * (1 - math.cos(2 * TAU * p)) / 2, 0.0]
        return pose

    def idle(p):
        pose = rest()
        breath = math.sin(TAU * p)
        add(pose, "Chest", 1.6 * breath)
        add(pose, "Spine", 0.6 * breath)
        add(pose, "Head", -0.8 * breath, 4 * math.sin(TAU * p * 0.5 + 0.4), 0)
        relaxed_arms(pose, 7 + 0.8 * breath)
        add(pose, "LeftUpperArm", 1.5 * breath)
        add(pose, "RightUpperArm", 1.5 * breath)
        pose["hips_offset"] = [0.0, 0.004 * breath, 0.0]
        return pose

    def crouch_idle(p):
        pose = rest()
        breath = math.sin(TAU * p)
        add(pose, "LeftUpperLeg", -60, 0, 6)
        add(pose, "RightUpperLeg", -60, 0, -6)
        add(pose, "LeftLowerLeg", 98)
        add(pose, "RightLowerLeg", 98)
        add(pose, "LeftFoot", -38)
        add(pose, "RightFoot", -38)
        add(pose, "Spine", 18 + 0.6 * breath)
        add(pose, "Chest", 8 + 1.2 * breath)
        add(pose, "Head", -20, 3 * math.sin(TAU * p * 0.5), 0)
        add(pose, "LeftUpperArm", -22, 0, 12)
        add(pose, "RightUpperArm", -22, 0, -12)
        add(pose, "LeftLowerArm", -55)
        add(pose, "RightLowerArm", -55)
        pose["hips_offset"] = [0.0, -0.35, 0.02]
        return pose

    def crouch_walk(p):
        pose = rest()
        s = math.sin(TAU * p)
        add(pose, "LeftUpperLeg", -58 - 16 * s, 0, 5)
        add(pose, "RightUpperLeg", -58 + 16 * s, 0, -5)
        knee_l = 96 + 14 * max(0.0, math.sin(TAU * (p - 0.7)))
        knee_r = 96 + 14 * max(0.0, math.sin(TAU * (p - 0.2)))
        add(pose, "LeftLowerLeg", knee_l)
        add(pose, "RightLowerLeg", knee_r)
        add(pose, "LeftFoot", -38 - 8 * s)
        add(pose, "RightFoot", -38 + 8 * s)
        add(pose, "Spine", 20)
        add(pose, "Chest", 8, -3 * s, 0)
        add(pose, "Hips", 0, 3 * s, 0)
        add(pose, "Head", -22, 2 * s, 0)
        add(pose, "LeftUpperArm", -18 + 12 * s, 0, 12)
        add(pose, "RightUpperArm", -18 - 12 * s, 0, -12)
        add(pose, "LeftLowerArm", -50)
        add(pose, "RightLowerArm", -50)
        pose["hips_offset"] = [0.0, -0.33 - 0.012 * (1 - math.cos(2 * TAU * p)) / 2, 0.02]
        return pose

    def talk(p):
        pose = rest()
        breath = math.sin(TAU * p)
        add(pose, "Chest", 1.4 * breath, 2.5 * math.sin(TAU * p * 0.5), 0)
        add(pose, "Spine", 0.5 * breath)
        add(pose, "Head", 3 * math.sin(TAU * p * 2), 5 * math.sin(TAU * p), 1.5 * math.sin(TAU * p * 1.5))
        relaxed_arms(pose, 7)
        add(pose, "RightUpperArm", -22 - 9 * math.sin(TAU * p * 2), 0, -10)
        add(pose, "RightLowerArm", -62 + 16 * math.sin(TAU * p * 3))
        add(pose, "LeftUpperArm", -6)
        add(pose, "LeftLowerArm", -22 + 6 * math.sin(TAU * p * 2 + 1))
        pose["hips_offset"] = [0.0, 0.003 * breath, 0.0]
        return pose

    def interact(p):
        pose = rest()
        reach = smoothstep(0, 0.35, p) - smoothstep(0.62, 1.0, p)
        relaxed_arms(pose, 7)
        add(pose, "RightUpperArm", -78 * reach)
        add(pose, "RightLowerArm", -12 * reach)
        add(pose, "Spine", 7 * reach)
        add(pose, "Chest", 2 * reach, -4 * reach, 0)
        add(pose, "Head", 9 * reach, -5 * reach, 0)
        pose["hips_offset"] = [0.0, 0.0, 0.0]
        return pose

    return {
        "Idle": (4.0, True, idle),
        "Walk": (1.05, True, lambda p: gait(p, 27, 42, 18, -14, 3, 0.018, 3)),
        "Run": (0.62, True, lambda p: gait(p, 46, 78, 38, -78, 12, 0.045, 5)),
        "CrouchIdle": (3.5, True, crouch_idle),
        "CrouchWalk": (1.1, True, crouch_walk),
        "Talk": (4.0, True, talk),
        "Interact": (1.2, False, interact),
    }


def world_rotation_from_gltf_euler(rx: float, ry: float, rz: float) -> Matrix:
    """Ângulos (graus) nas convenções glTF do gen-character.mjs -> matriz de rotação em espaço Blender.
    rx: inclinação (igual), ry: guinada sobre o eixo para cima (Blender Z), rz: rolamento sobre o eixo frontal (Blender -Y)."""
    mx = Matrix.Rotation(math.radians(rx), 3, "X")
    mz = Matrix.Rotation(math.radians(ry), 3, "Z")
    my = Matrix.Rotation(math.radians(-rz), 3, "Y")
    return mx @ mz @ my


def apply_pose(arm, pose: dict, arm_fix: dict[str, Matrix], scale: float):
    """Aplica rotações em eixos do mundo (compostas sobre o ajuste de braços da A-pose)."""
    for key, bone_name in B.items():
        pb = arm.pose.bones.get(bone_name)
        if pb is None:
            continue
        rx, ry, rz = pose.get(key, [0, 0, 0])
        world = world_rotation_from_gltf_euler(rx, ry, rz)
        if key in arm_fix:
            world = world @ arm_fix[key]
        rest = arm.data.bones[bone_name].matrix_local.to_3x3()
        local = rest.inverted() @ world @ rest
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = local.to_quaternion()
    hips = arm.pose.bones[B["Hips"]]
    ox, oy, oz = pose.get("hips_offset", [0, 0, 0])
    # offset em convenção glTF (x, y-up, z-front) -> Blender (x, -z, y), proporcional à altura
    world_off = Vector((ox, -oz, oy)) * scale
    rest = arm.data.bones[B["Hips"]].matrix_local.to_3x3()
    hips.location = rest.inverted() @ world_off


def arm_rest_fix(arm, abduction_deg=9.0) -> dict[str, Matrix]:
    """A malha do MakeHuman está em A-pose; gira os braços para pender junto ao corpo."""
    fix = {}
    for key, sign in (("LeftUpperArm", 1), ("RightUpperArm", -1)):
        bone = arm.data.bones[B[key]]
        d = (bone.tail_local - bone.head_local).normalized()
        # ângulo atual em relação a "para baixo" no plano frontal (X,Z)
        current = math.degrees(math.atan2(abs(d.x), -d.z))
        delta = current - abduction_deg
        # rotação em torno do eixo frontal (Blender Y): +θ baixa o braço esquerdo (+X), -θ o direito
        fix[key] = Matrix.Rotation(math.radians(delta) * sign, 3, "Y")
    return fix


def apply_arms_down_rest_pose(arm, mesh_objs):
    """A malha do MakeHuman vem em A-pose. Gira os braços para pender junto ao corpo, aplica a deformação
    nas malhas e torna essa a pose de descanso (rest pose) do rig, de modo que os clipes procedurais
    trabalhem a partir de braços caídos."""
    fix = arm_rest_fix(arm)
    for key, world in fix.items():
        bone_name = B[key]
        pb = arm.pose.bones[bone_name]
        rest = arm.data.bones[bone_name].matrix_local.to_3x3()
        pb.rotation_mode = "QUATERNION"
        pb.rotation_quaternion = (rest.inverted() @ world @ rest).to_quaternion()
    bpy.context.view_layer.update()
    for obj in mesh_objs:
        mods = [m for m in obj.modifiers if m.type == "ARMATURE"]
        for m in mods:
            with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
                bpy.ops.object.modifier_apply(modifier=m.name)
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
    bpy.context.view_layer.objects.active = arm
    with bpy.context.temp_override(object=arm, active_object=arm, selected_objects=[arm]):
        bpy.ops.object.mode_set(mode="POSE")
        bpy.ops.pose.armature_apply(selected=False)
        bpy.ops.object.mode_set(mode="OBJECT")


ANIM_LIBRARY_DEFAULT = os.path.join(REPO, "assets-src", "animations", "ual-standard", "standard", "Unreal-Godot", "UAL1_Standard.glb")


def build_animations_from_library(arm, library_path: str) -> dict:
    """Clipes reais: Quaternius Universal Animation Library (CC0) retargeteada para o rig Mixamo (retarget.py)."""
    sys.path.insert(0, HERE)
    import retarget  # noqa: E402

    lib = retarget.load_library(library_path)
    frames = retarget.retarget_clips(lib, arm)
    # remove a armadura/malha da biblioteca da cena (não deve ser exportada nem contaminar seleção)
    for o in [lib.arm] + [c for c in lib.arm.children_recursive]:
        bpy.data.objects.remove(o, do_unlink=True)
    for a in list(lib.actions.values()):
        if a.users == 0:
            bpy.data.actions.remove(a)
    return {name: {"duration": round(n / FPS, 4), "loop": loop, "source": src, "frames": n} for name, (src, loop) in retarget.GAME_CLIPS.items() for n in [frames[name]]}


def build_animations(arm, scale: float):
    """Fallback procedural (baixa qualidade) — só é usado se a biblioteca de animações não existir."""
    clips = rest_pose_lib()
    arm.animation_data_create()
    arm_fix = {}
    for name, (duration, loop, fn) in clips.items():
        action = bpy.data.actions.new(name)
        arm.animation_data.action = action
        frames = max(2, round(duration * FPS)) + 1
        for f in range(frames):
            p = (f / (frames - 1)) % 1.0 if loop else f / (frames - 1)
            apply_pose(arm, fn(p), arm_fix, scale)
            for bone_name in B.values():
                pb = arm.pose.bones.get(bone_name)
                if pb is not None:
                    pb.keyframe_insert("rotation_quaternion", frame=f + 1)
            arm.pose.bones[B["Hips"]].keyframe_insert("location", frame=f + 1)
        arm.animation_data.action = None
        track = arm.animation_data.nla_tracks.new()
        track.name = name
        strip = track.strips.new(name, 1, action)
        strip.name = name
        track.mute = False
    # pose de descanso: braços caídos (para o viewer/avaliação)
    apply_pose(arm, {k: [0, 0, 0] for k in B} | {"hips_offset": [0, 0, 0]}, arm_fix, scale)


# ---------------------------------------------------------------------------
# Montagem de um personagem
# ---------------------------------------------------------------------------
def build_character(name: str, spec: dict, base: BaseMesh, vgroups, weights, tex_size: int, do_bake: bool, out_dir: str, anim_library: str | None = None):
    t0 = time.time()
    clear_scene()
    verts_mh = morph(base, spec)
    # escala para a altura desejada (topo da cabeça)
    body_idx = range(0, 13380)
    top = max(verts_mh[i].z for i in body_idx)
    bottom = min(verts_mh[i].z for i in body_idx)
    scale = spec["height"] / (top - bottom)
    verts = [Vector((v.x * scale, v.y * scale, (v.z - bottom) * scale)) for v in verts_mh]
    log(f"{name}: altura base {top - bottom:.3f} m -> escala {scale:.3f}")

    # --- corpo ------------------------------------------------------------
    body_faces = base.group_faces("body")
    body, remap = make_mesh_object(f"{name}_body", verts, body_faces, base.uvs)
    assign_weights(body, remap, weights)
    # redução de polígonos (NPCs mais leves; o rosto mantém detalhe suficiente a 0.5)
    ratio = spec.get("decimate", 1.0)
    if ratio < 1.0:
        mod = body.modifiers.new("Decimate", "DECIMATE")
        mod.ratio = ratio
        mod.use_collapse_triangulate = True
        bpy.context.view_layer.objects.active = body
        with bpy.context.temp_override(object=body, active_object=body, selected_objects=[body]):
            bpy.ops.object.modifier_apply(modifier=mod.name)
        for p in body.data.polygons:
            p.use_smooth = True
        log(f"{name}: decimado para {len(body.data.polygons)} faces (ratio {ratio})")

    # --- armature ---------------------------------------------------------
    arm, joints = build_armature(f"{name}_armature", verts, vgroups, 1.0)
    parent_to_armature(body, arm)

    # --- máscaras por vértice (sobrancelha, barba) ------------------------
    eye_l_j = sum((verts[i] for i in group_indices(vgroups, "joint-l-eye")), Vector()) / 8
    eye_r_j = sum((verts[i] for i in group_indices(vgroups, "joint-r-eye")), Vector()) / 8
    eye_z = (eye_l_j.z + eye_r_j.z) / 2
    mouth = sum((verts[i] for i in group_indices(vgroups, "joint-mouth")), Vector()) / 8
    jaw = sum((verts[i] for i in group_indices(vgroups, "joint-jaw")), Vector()) / 8
    head_j = joints["mixamorig:Head"]
    color_brow = body.data.color_attributes.new("mask_brow", "FLOAT_COLOR", "POINT")
    color_beard = body.data.color_attributes.new("mask_beard", "FLOAT_COLOR", "POINT")
    for v in body.data.vertices:
        co = v.co
        # sobrancelha: faixa arqueada logo acima dos olhos, só na frente do rosto
        dx = abs(co.x - head_j.x)
        in_front = smoothstep(0.035, 0.06, head_j.y - co.y)  # 1 na face, 0 perto do plano das orelhas
        arch = eye_z + 0.016 + 0.007 * math.cos(math.pi * max(-1.0, min(1.0, (dx - 0.034) / 0.034)))
        band = math.exp(-((co.z - arch) / 0.006) ** 2)
        horiz = smoothstep(0.011, 0.018, dx) * (1 - smoothstep(0.05, 0.06, dx))
        brow = band * horiz * in_front * (0.6 + 0.4 * (1 - smoothstep(0.03, 0.058, dx)))
        color_brow.data[v.index].color = (brow, brow, brow, 1.0)
        # barba rala: bigode + queixo/maxilar (lábios ficam entre eye_z-0.074 e eye_z-0.056)
        mustache = smoothstep(eye_z - 0.056, eye_z - 0.05, co.z) * (1 - smoothstep(eye_z - 0.042, eye_z - 0.036, co.z)) * (1 - smoothstep(0.026, 0.036, dx))
        chin = (1 - smoothstep(eye_z - 0.082, eye_z - 0.074, co.z)) * smoothstep(jaw.z - 0.04, jaw.z - 0.015, co.z)
        side = 1 - smoothstep(0.07, 0.085, dx)
        beard = min(1.0, (mustache + chin) * in_front * side)
        color_beard.data[v.index].color = (beard, beard, beard, 1.0)

    # --- regiões de roupa -------------------------------------------------
    lw = local_weights(body)
    region = dominant_region(body, lw, spec.get("sleeves", "long"))
    faces_by_region: dict[str, list[int]] = {"shirt": [], "pants": [], "boots": []}
    for p in body.data.polygons:
        regs = [region[vi] for vi in p.vertices]
        if regs.count("skin") >= 3:
            continue
        # faces mistas (ex.: 2 vértices camisa + 2 calça) vão para a região com mais votos — sem anéis sem dono
        best = max(faces_by_region, key=lambda r: regs.count(r))
        if regs.count(best) >= 1:
            faces_by_region[best].append(p.index)
    # sobreposições: camisa desce sobre a calça (camisa por fora), calça desce sobre a bota
    def grow(src: str, into: str, rings: int):
        src_set = set(faces_by_region[src])
        into_set = set(faces_by_region[into])
        for _ in range(rings):
            verts_src = {vi for fi in src_set for vi in body.data.polygons[fi].vertices}
            for p in body.data.polygons:
                if p.index in into_set and any(vi in verts_src for vi in p.vertices):
                    src_set.add(p.index)
        faces_by_region[src] = sorted(src_set)

    grow("pants", "shirt", 2)
    grow("shirt", "pants", 5)
    grow("boots", "pants", 1)
    grow("pants", "boots", 3)

    measures = body_measures(body, region, joints)
    hips_z = joints["mixamorig:Hips"].z
    face_minz = lambda fi: min(body.data.vertices[vi].co.z for vi in body.data.polygons[fi].vertices)  # noqa: E731
    face_maxz = lambda fi: max(body.data.vertices[vi].co.z for vi in body.data.polygons[fi].vertices)  # noqa: E731
    face_center = lambda fi: sum((body.data.vertices[vi].co for vi in body.data.polygons[fi].vertices), Vector()) / len(body.data.polygons[fi].vertices)  # noqa: E731
    z_hem = None
    if spec.get("shirt_hem") is not None:
        # túnica/farda: a camisa desce sobre o quadril até a barra (acima do gancho, onde o tronco ainda é um anel só);
        # a calça sob ela só fica numa faixa de 6 cm acima da barra (o resto ficaria escondido)
        z_hem = hips_z + spec["shirt_hem"]
        shirt_set, pants_set = set(faces_by_region["shirt"]), set(faces_by_region["pants"])
        for fi in list(pants_set):
            if face_maxz(fi) > z_hem:
                shirt_set.add(fi)  # faces que cruzam a barra entram e o bisect corta reto
            if face_minz(fi) > z_hem + 0.06:
                pants_set.discard(fi)
        faces_by_region["shirt"], faces_by_region["pants"] = sorted(shirt_set), sorted(pants_set)
    # faces que vão para a malha de cada roupa (a camiseta sob a jaqueta aberta só existe na abertura)
    mesh_faces = dict(faces_by_region)
    jacket = spec.get("jacket")
    jacket_faces: list[int] = []
    if jacket:
        jz_hem = hips_z + jacket.get("hem", -0.07)
        in_open = jacket_opening(spec, joints, measures)
        for p in body.data.polygons:
            regs = [region[vi] for vi in p.vertices]
            if regs.count("skin") >= 3 or regs.count("boots") >= 2 or face_maxz(p.index) < jz_hem:
                continue
            if not in_open(face_center(p.index), -0.03):
                jacket_faces.append(p.index)  # a abertura é cortada depois por planos (bordas retas)
        # camiseta: só a faixa vista na abertura (tronco + começo do quadril), cortada por planos depois
        # (todas as faces da faixa, inclusive as de 'pele' no umbigo, onde nenhum osso de roupa domina)
        neck_z0 = joints["mixamorig:Neck"].z
        mesh_faces["shirt"] = sorted(p.index for p in body.data.polygons
                                     if face_maxz(p.index) > jz_hem - 0.05 and face_center(p.index).z < neck_z0 - 0.02
                                     and in_open(face_center(p.index), 0.07))

    cloth_objs = []
    cloth: dict[str, object] = {}
    spec_mats = {
        "shirt": simple_material(f"{name}_mat_shirt", spec["shirt"], 0.88),
        "pants": simple_material(f"{name}_mat_pants", spec["pants"], 0.9),
        "boots": simple_material(f"{name}_mat_boots", spec["boots"], 0.6),
    }
    offsets = {"shirt": spec.get("shirt_offset", 0.013), "pants": spec.get("pants_offset", 0.010), "boots": 0.014}
    drape_spec = spec.get("drape", {})
    hidden_faces = set()
    if jacket_faces:
        jk = extract_faces(body, jacket_faces, f"{name}_jacket", jacket.get("offset", 0.027))
        cut_garment(jk, hem_z=jz_hem, opening=in_open)
        fill_concave(jk, iterations=16)
        drape_torso(jk, joints, measures)
        drape_cuffs(jk, joints)
        set_material(jk, simple_material(f"{name}_mat_jacket", jacket["color"], 0.9))
        mod = jk.modifiers.new("Solidify", "SOLIDIFY")
        mod.thickness = 0.005
        mod.offset = -1.0
        mod.use_rim = True
        parent_to_armature(jk, arm)
        cloth_objs.append(jk)
        cloth["jacket"] = jk
    for r, faces in faces_by_region.items():
        if not faces:
            continue
        own = mesh_faces.get(r, faces)
        if not own:
            continue
        obj = extract_faces(body, own, f"{name}_{r}", offsets[r])
        if r == "boots":
            smooth_mesh(obj, iterations=14, factor=0.6)
        if r == "shirt" and jacket_faces:
            # camiseta vista na abertura da jaqueta: faixa um pouco mais larga que a abertura, barra 2 cm abaixo da jaqueta
            cut_garment(obj, hem_z=jz_hem - 0.022, opening=in_open, margin=0.035, keep="inside")
        if r == "shirt" and z_hem is not None:
            cut_garment(obj, hem_z=z_hem)  # barra reta da túnica
        if r in ("shirt", "pants") and drape_spec.get("fill", bool(drape_spec)):
            fill_concave(obj, iterations=16 if r == "shirt" else 10)
        if r == "shirt" and drape_spec.get("torso"):
            drape_torso(obj, joints, measures)
        if r == "shirt" and drape_spec.get("cuffs"):
            drape_cuffs(obj, joints)
        if r == "pants" and drape_spec.get("legs"):
            drape_legs(obj, joints)
        cloth[r] = obj
        set_material(obj, spec_mats[r])
        mod = obj.modifiers.new("Solidify", "SOLIDIFY")
        mod.thickness = 0.004 if r != "boots" else 0.008
        mod.offset = -1.0
        mod.use_rim = True
        parent_to_armature(obj, arm)
        cloth_objs.append(obj)
        # faces do corpo sob a roupa são removidas; só ficam as que encostam em pele exposta
        # (pescoço, mãos, pés), para não abrir buracos nas transições
        skin_verts = {li for li, r in region.items() if r == "skin"}
        for fi in faces:
            if not any(vi in skin_verts for vi in body.data.polygons[fi].vertices):
                hidden_faces.add(fi)

    # camadas de cima não podem ser atravessadas pela calça (o preenchimento de vales a empurra para fora)
    if cloth.get("pants") is not None:
        pants_layer = LayerSurface([cloth["pants"]])
        for key in ("shirt", "jacket"):
            if cloth.get(key) is not None and (key == "jacket" or jacket_faces or z_hem is not None):
                push_outside(cloth[key], pants_layer, 0.004)

    # --- pele: material procedural + bake ----------------------------------
    skin = skin_material(f"{name}_mat_skin", spec)
    set_material(body, skin)
    if do_bake:
        cache_dir = os.path.join(HERE, ".cache")
        os.makedirs(cache_dir, exist_ok=True)
        img = bake_object_color(body, tex_size, f"{name}_skin", os.path.join(cache_dir, f"{name}_skin.png"))
        replace_with_baked(body, img, 0.5, f"{name}_skin_baked")
    else:
        flat = simple_material(f"{name}_skin_flat", spec["skin"], 0.5)
        set_material(body, flat)
    # cabelo: duplicado do couro cabeludo do próprio corpo (antes de remover faces cobertas)
    hair_objs = build_hair(name, spec, body, joints, vgroups, verts, scale)
    for h in hair_objs:
        if not h.vertex_groups:
            assign_single_bone(h, "mixamorig:Head")
        parent_to_armature(h, arm)

    # --- acessórios (alças usam faces do corpo: antes da remoção) -------------
    measures["layers"] = {}
    acc = build_accessories(name, spec, verts, vgroups, joints, scale, measures)
    # roupas volumétricas, uniforme, bolsa e armadura projetadas sobre a pele em resolução cheia
    surf = BodySurface(verts, body_faces)
    acc += build_outfit(name, spec, surf, joints, verts, vgroups, measures, cloth | measures["layers"], body)
    for obj, bone in acc:
        if bone:
            assign_single_bone(obj, bone)
        parent_to_armature(obj, arm)
    delete_faces(body, hidden_faces)

    # --- olhos (high-poly do MakeHuman, ajustados por mhclo) ---------------
    eyes = build_eyes(name, verts, scale)
    if eyes is not None:
        assign_single_bone(eyes, "mixamorig:Head")
        parent_to_armature(eyes, arm)

    # --- rest pose com braços caídos + animações --------------------------------
    mesh_objs = [body] + cloth_objs + hair_objs + [o for o, _ in acc] + ([eyes] if eyes else [])
    apply_arms_down_rest_pose(arm, mesh_objs)
    if anim_library:
        clips_info = build_animations_from_library(arm, anim_library)
        log(f"{name}: animações da biblioteca ({os.path.basename(anim_library)}): " + ", ".join(f"{k}={v['frames']}f" for k, v in clips_info.items()))
    else:
        log(f"{name}: AVISO — biblioteca de animações ausente; usando clipes procedurais provisórios")
        build_animations(arm, scale)
        clips_info = {k: {"duration": d, "loop": l, "source": "procedural"} for k, (d, l, _) in rest_pose_lib().items()}

    # --- export ---------------------------------------------------------------
    objs = [arm, body] + cloth_objs + hair_objs + [o for o, _ in acc] + ([eyes] if eyes else [])
    n_before = len(objs) - 1
    objs = [arm] + consolidate(objs[1:])
    log(f"{name}: {n_before} malhas -> {len(objs) - 1} (materiais iguais fundidos: menos draw calls)")
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = arm
    arm.name = f"{name}_armature"
    out = os.path.join(out_dir, f"{name}.glb")
    bpy.ops.export_scene.gltf(
        filepath=out,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_vertex_color="NONE",
        export_image_format="JPEG",
        export_jpeg_quality=85,
        export_skins=True,
        export_all_influences=False,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_frame_range=False,
        export_anim_slide_to_zero=True,
        export_optimize_animation_size=True,
        export_def_bones=False,
        export_rest_position_armature=True,
        export_morph=False,
        export_extras=True,
    )
    # triângulos exportados (com solidify/chanfro aplicados), o mesmo número que o validador da Khronos reporta
    dg = bpy.context.evaluated_depsgraph_get()
    tris = 0
    for o in objs:
        if o.type == "MESH":
            ev = o.evaluated_get(dg)
            me = ev.to_mesh()
            me.calc_loop_triangles()
            tris += len(me.loop_triangles)
            ev.to_mesh_clear()
    log(f"{name}: exportado {out} ({os.path.getsize(out) / 1024:.0f} KB, {tris} triângulos) em {time.time() - t0:.1f}s")
    return {"file": f"{name}.glb", "label": spec["label"], "height": spec["height"], "triangles": tris, "bones": len(arm.data.bones)}, clips_info


def build_eyes(name: str, verts: list[Vector], scale: float):
    obj_path = os.path.join(DATA, "eyes", "high-poly.obj")
    mhclo_path = os.path.join(DATA, "eyes", "high-poly.mhclo")
    if not (os.path.exists(obj_path) and os.path.exists(mhclo_path)):
        return None
    # parse obj
    eye_verts, eye_uvs, eye_faces = [], [], []
    for line in open(obj_path, "r", encoding="utf-8"):
        if line.startswith("v "):
            _, x, y, z = line.split()[:4]
            eye_verts.append((float(x), float(y), float(z)))
        elif line.startswith("vt "):
            _, u, v = line.split()[:3]
            eye_uvs.append((float(u), float(v)))
        elif line.startswith("f "):
            vi, ti = [], []
            for part in line.split()[1:]:
                comps = part.split("/")
                vi.append(int(comps[0]) - 1)
                ti.append(int(comps[1]) - 1 if len(comps) > 1 and comps[1] else -1)
            eye_faces.append((vi, ti))
    # parse mhclo: linhas "v1 v2 v3 w1 w2 w3 dx dy dz" após "verts 0"; escalas por eixo
    scales = {"x": 1.0, "y": 1.0, "z": 1.0}
    fit = []
    in_verts = False
    for line in open(mhclo_path, "r", encoding="utf-8"):
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        if s.startswith(("x_scale", "y_scale", "z_scale")):
            axis, a, b, ref = s.split()[:4]
            a, b, ref = int(a), int(b), float(ref)
            # distância atual entre vértices de referência (em dm, espaço MakeHuman) / referência
            pa, pb = verts[a] / scale / MH_SCALE, verts[b] / scale / MH_SCALE
            comp = {"x_scale": "x", "y_scale": "z", "z_scale": "y"}[axis]  # eixos MH: y=up (Blender z), z=front (Blender -y)
            dist = abs(getattr(pa, comp) - getattr(pb, comp))
            scales[axis[0]] = dist / ref if ref else 1.0
            continue
        if s.startswith("verts"):
            in_verts = True
            continue
        if in_verts:
            parts = s.split()
            if len(parts) >= 9:
                fit.append(([int(parts[0]), int(parts[1]), int(parts[2])], [float(parts[3]), float(parts[4]), float(parts[5])], [float(parts[6]), float(parts[7]), float(parts[8])]))
            elif len(parts) == 1:
                fit.append(([int(parts[0])] * 3, [1.0, 0.0, 0.0], [0.0, 0.0, 0.0]))
    if len(fit) < len(eye_verts):
        log("mhclo incompleto para os olhos; ignorando")
        return None
    out_verts = []
    for i in range(len(eye_verts)):
        refs, w, off = fit[i]
        p = verts[refs[0]] * w[0] + verts[refs[1]] * w[1] + verts[refs[2]] * w[2]
        # offsets em espaço MakeHuman (dm) escalados por eixo
        d = mh_vec(off[0] * scales["x"], off[1] * scales["y"], off[2] * scales["z"]) * scale
        out_verts.append(p + d)
    mesh = bpy.data.meshes.new(f"{name}_eyes")
    mesh.from_pydata([tuple(v) for v in out_verts], [], [vi for vi, _ in eye_faces])
    mesh.update()
    uv_layer = mesh.uv_layers.new(name="UVMap")
    for poly, (vi, ti) in zip(mesh.polygons, eye_faces):
        for k in range(len(vi)):
            uv_layer.data[poly.loop_start + k].uv = eye_uvs[ti[k]] if ti[k] >= 0 else (0, 0)
    for p in mesh.polygons:
        p.use_smooth = True
    obj = bpy.data.objects.new(f"{name}_eyes", mesh)
    bpy.context.scene.collection.objects.link(obj)
    mat = bpy.data.materials.new(f"{name}_mat_eyes")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.15
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = load_image(os.path.join(DATA, "eyes", "brown_eye.png"), "sRGB")
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    # a córnea do olho do MakeHuman é transparente (alpha 0 na textura): recorte por alpha
    nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
    mat.surface_render_method = "DITHERED"
    mat.blend_method = "CLIP"
    mat.alpha_threshold = 0.5
    mat.use_backface_culling = True
    set_material(obj, mat)
    return obj


def build_hair(name: str, spec: dict, body, joints, vgroups_global, verts: list[Vector], scale: float):
    """Cabelo curto: faces do couro cabeludo do corpo duplicadas e afastadas, com ondulação por ruído."""
    style = spec.get("hair_style", "short-wavy")
    objs = []
    hair_mat = simple_material(f"{name}_mat_hair", spec["hair"], 0.62)
    if spec.get("gray_hair", 0) > 0:
        g = spec["gray_hair"]
        c = hex_to_linear(spec["hair"])
        hair_mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (c[0] * (1 - g) + 0.13 * g, c[1] * (1 - g) + 0.125 * g, c[2] * (1 - g) + 0.12 * g, 1)
    head = joints["mixamorig:Head"]
    eye_z = sum((verts[i].z for i in group_indices(vgroups_global, "joint-l-eye")), 0.0) / 8
    ear_y = head.y  # orelhas ficam aproximadamente no plano do eixo da cabeça

    scarf = bool(spec.get("headscarf"))

    def keep(co: Vector) -> bool:
        f = max(0.0, min(1.0, (ear_y - co.y) / 0.095))  # 0 no plano das orelhas, 1 na testa
        if scarf:
            if f > 0.35:
                return co.z > eye_z + 0.055
            return co.z > eye_z - 0.075 and not (f > 0 and abs(co.x - head.x) < 0.05 and co.z < eye_z + 0.055)
        if f > 0:
            # costeletas descem até a linha dos olhos só bem perto das orelhas; testa/têmporas ~6 cm acima
            return co.z > eye_z + 0.062 * min(1.0, f / 0.22)
        if abs(co.x - head.x) > 0.055:
            return co.z > eye_z + 0.0  # atrás das orelhas
        return co.z > eye_z - 0.05  # nuca

    faces = [p.index for p in body.data.polygons if all(keep(body.data.vertices[vi].co) for vi in p.vertices)]
    if not faces:
        return objs
    cap = extract_faces(body, faces, f"{name}_hair", 0.006)
    if style == "cap":
        fabric = simple_material(f"{name}_mat_cap", spec.get("cap", "#1f2622"), 0.9)
        set_material(cap, fabric)
        mod = cap.modifiers.new("Solidify", "SOLIDIFY")
        mod.thickness = 0.01
        mod.offset = 1.0
        top = max(v.co.z for v in cap.data.vertices)
        front = min(v.co.y for v in cap.data.vertices)
        visor = add_primitive("cube", f"{name}_visor", Vector((head.x, front - 0.035, top - 0.05)), scale=(0.16 * scale, 0.075, 0.008))
        bevel(visor, 0.01, 2)
        set_material(visor, fabric)
        objs.append(visor)
    elif style == "buzz":
        # cabelo raspado (fica sob o capacete): casca fina, sem ondulação
        set_material(cap, hair_mat)
        mod = cap.modifiers.new("Solidify", "SOLIDIFY")
        mod.thickness = 0.003
        mod.offset = 1.0
    else:
        set_material(cap, hair_mat)
        sub = cap.modifiers.new("Subdivision", "SUBSURF")
        sub.levels = 1
        sub.render_levels = 1
        bpy.context.view_layer.objects.active = cap
        bpy.ops.object.modifier_apply(modifier=sub.name)
        disp = cap.modifiers.new("Displace", "DISPLACE")
        tex = bpy.data.textures.new(f"{name}_hair_noise", "CLOUDS")
        tex.noise_scale = 0.03
        tex.noise_depth = 2
        disp.texture = tex
        disp.strength = 0.011 if style == "short-wavy" else 0.007
        disp.mid_level = 0.45
        bpy.ops.object.modifier_apply(modifier=disp.name)
        mod = cap.modifiers.new("Solidify", "SOLIDIFY")
        mod.thickness = 0.012
        mod.offset = 1.0
        if style in ("bun", "ponytail"):
            back = max(v.co.y for v in cap.data.vertices)
            zc = sum(v.co.z for v in cap.data.vertices) / len(cap.data.vertices)
            if style == "bun":
                bun = add_primitive("sphere", f"{name}_bun", Vector((head.x, back + 0.03, zc + 0.01)), scale=(0.08, 0.075, 0.07))
            else:
                bun = add_primitive("sphere", f"{name}_tail", Vector((head.x, back + 0.04, zc - 0.08)), scale=(0.05, 0.05, 0.24))
            set_material(bun, hair_mat)
            objs.append(bun)
    if spec.get("headscarf"):
        scarf = simple_material(f"{name}_mat_scarf", spec["headscarf"], 0.9)
        set_material(cap, scarf)
        for m in list(cap.modifiers):
            if m.type == "SOLIDIFY":
                m.thickness = 0.02
        back = max(v.co.y for v in cap.data.vertices)
        zc = sum(v.co.z for v in cap.data.vertices) / len(cap.data.vertices)
        drape = add_primitive("cube", f"{name}_scarf_drape", Vector((head.x, back + 0.02, zc - 0.13)), scale=(0.17, 0.05, 0.26))
        bevel(drape, 0.02, 3)
        set_material(drape, scarf)
        objs.append(drape)
    objs.insert(0, cap)
    return objs


def body_measures(body, region: dict[int, str], joints) -> dict:
    """Medidas do tronco/quadril usando só vértices das regiões de roupa (exclui braços em A-pose)."""
    hips = joints["mixamorig:Hips"]
    spine2 = joints["mixamorig:Spine2"]
    pants = [v.co for v in body.data.vertices if region.get(v.index) == "pants" and abs(v.co.z - hips.z) < 0.05]
    torso = [v.co for v in body.data.vertices if region.get(v.index) == "shirt" and abs(v.co.z - spine2.z) < 0.08 and abs(v.co.x - spine2.x) < 0.10]
    return {
        "body": body,
        "hip_half_w": max((abs(c.x - hips.x) for c in pants), default=0.17),
        "hip_back": max((c.y for c in pants), default=hips.y + 0.1),
        "hip_front": min((c.y for c in pants), default=hips.y - 0.1),
        "torso_back": max((c.y for c in torso), default=spine2.y + 0.1),
        "torso_front": min((c.y for c in torso), default=spine2.y - 0.1),
        "torso_half_w": max((abs(v.co.x - spine2.x) for v in body.data.vertices if region.get(v.index) == "shirt" and abs(v.co.z - spine2.z) < 0.05 and abs(v.co.x - spine2.x) < 0.22), default=0.18),
    }


def build_accessories(name: str, spec: dict, verts: list[Vector], vgroups, joints, scale: float, m: dict):
    out = []
    head = joints["mixamorig:Head"]
    eye_l = sum((verts[i] for i in group_indices(vgroups, "joint-l-eye")), Vector()) / 8
    eye_r = sum((verts[i] for i in group_indices(vgroups, "joint-r-eye")), Vector()) / 8
    if spec.get("glasses"):
        frame = simple_material(f"{name}_mat_frame", "#15130f", 0.4, 0.3)
        lens = simple_material(f"{name}_mat_lens", "#9fb4c4", 0.05, 0.0, alpha=0.22)
        lens_r = 0.0195 * scale
        for side, e in (("l", eye_l), ("r", eye_r)):
            c = Vector((e.x, e.y - 0.028 * scale, e.z - 0.002))
            t = add_primitive("torus", f"{name}_glasses_{side}", c, rotation=(math.pi / 2, 0, 0), major=lens_r, minor=0.0022, major_segments=28, minor_segments=8)
            t.scale = (1.0, 1.0, 0.82)
            bpy.ops.object.transform_apply(scale=True)
            set_material(t, frame)
            out.append((t, "mixamorig:Head"))
            disc = add_primitive("circle", f"{name}_lens_{side}", c, scale=(lens_r * 2 * 0.98, lens_r * 2 * 0.98 * 0.82, 1), rotation=(math.pi / 2, 0, 0), vertices=24)
            set_material(disc, lens)
            out.append((disc, "mixamorig:Head"))
        # ponte
        mid = (eye_l + eye_r) / 2
        bridge = add_primitive("cylinder", f"{name}_glasses_bridge", Vector((mid.x, mid.y - 0.03 * scale, mid.z + 0.004)), scale=(0.004, 0.004, abs(eye_l.x - eye_r.x) - lens_r * 2 + 0.004), rotation=(0, math.pi / 2, 0), vertices=8)
        set_material(bridge, frame)
        out.append((bridge, "mixamorig:Head"))
        # hastes: da borda externa da lente até acima da orelha
        ear_half_w = 0.076 * scale
        for side, e, sgn in (("l", eye_l, 1), ("r", eye_r, -1)):
            x0 = e.x + sgn * (lens_r + 0.003)
            y0 = e.y - 0.024 * scale
            x1 = head.x + sgn * (ear_half_w + 0.004)
            y1 = head.y + 0.01
            length = math.hypot(x1 - x0, y1 - y0)
            yaw = -math.atan2(x1 - x0, y1 - y0)
            temple = add_primitive("cylinder", f"{name}_temple_{side}", Vector(((x0 + x1) / 2, (y0 + y1) / 2, e.z + 0.006)), scale=(0.0035, 0.0035, length), rotation=(math.pi / 2, 0, yaw), vertices=8)
            set_material(temple, frame)
            out.append((temple, "mixamorig:Head"))
    hips = joints["mixamorig:Hips"]
    spine2 = joints["mixamorig:Spine2"]
    neck = joints["mixamorig:Neck"]
    torso_back, hip_half_w = m["torso_back"], m["hip_half_w"]
    if spec.get("backpack"):
        pack_mat = simple_material(f"{name}_mat_pack", spec["backpack"], 0.9)
        strap_mat = simple_material(f"{name}_mat_strap", "#2a2924", 0.85)
        pack = add_primitive("cube", f"{name}_backpack", Vector((spine2.x, torso_back + 0.085, spine2.z - 0.02)), scale=(0.30 * scale, 0.15, 0.40 * scale))
        bevel(pack, 0.035, 4)
        set_material(pack, pack_mat)
        out.append((pack, "mixamorig:Spine2"))
        pocket = add_primitive("cube", f"{name}_backpack_pocket", Vector((spine2.x, torso_back + 0.17, spine2.z - 0.08)), scale=(0.22 * scale, 0.05, 0.16 * scale))
        bevel(pocket, 0.02, 3)
        set_material(pocket, pack_mat)
        out.append((pocket, "mixamorig:Spine2"))
        # alças: faixas da própria malha do corpo (acompanham peito e ombros), por fora da camisa
        for sgn in (1, -1):
            sx = spine2.x + sgn * 0.065 * scale
            def strap_keep(co, sx=sx):
                if abs(co.x - sx) > 0.026 or co.z > neck.z + 0.01:
                    return False
                if co.z > spine2.z + 0.10:
                    return True  # por cima do ombro (abaixo do pescoço)
                return co.y < spine2.y and co.z > spine2.z - 0.17  # desce pela frente do peito
            faces = [p.index for p in m["body"].data.polygons if all(strap_keep(m["body"].data.vertices[vi].co) for vi in p.vertices)]
            if faces:
                strap = extract_faces(m["body"], faces, f"{name}_strap_{'l' if sgn > 0 else 'r'}", 0.019, smooth_edges=False)
                smooth_boundary(strap, 2, 0.3)
                mod = strap.modifiers.new("Solidify", "SOLIDIFY")
                mod.thickness = 0.005
                mod.offset = -1.0
                set_material(strap, strap_mat)
                out.append((strap, None))
    if spec.get("toolbelt"):
        belt_mat = simple_material(f"{name}_mat_belt", "#2b231c", 0.7)
        belt = add_primitive("torus", f"{name}_belt", Vector((hips.x, hips.y + 0.005, hips.z + 0.035)), major=hip_half_w + 0.008, minor=0.012, major_segments=36, minor_segments=8)
        belt.scale = (1.0, 0.8, 1.6)
        bpy.ops.object.transform_apply(scale=True)
        set_material(belt, belt_mat)
        out.append((belt, "mixamorig:Hips"))
        pouch = add_primitive("cube", f"{name}_pouch", Vector((hips.x + hip_half_w + 0.03, hips.y + 0.01, hips.z - 0.03)), scale=(0.07, 0.10, 0.12))
        bevel(pouch, 0.015, 3)
        set_material(pouch, simple_material(f"{name}_mat_pouch", "#4a3d2f", 0.85))
        out.append((pouch, "mixamorig:Hips"))
        tool = add_primitive("cylinder", f"{name}_tool", Vector((hips.x - hip_half_w - 0.025, hips.y + 0.02, hips.z - 0.06)), scale=(0.018, 0.018, 0.17), vertices=8)
        set_material(tool, simple_material(f"{name}_mat_tool", "#8a8f94", 0.35, 0.8))
        out.append((tool, "mixamorig:Hips"))
    body = m["body"]
    hips_z, spine2_z = hips.z, spine2.z

    def layer(name_suffix, keep, offset, color, roughness=0.9, thickness=0.004):
        faces = [p.index for p in body.data.polygons if all(keep(body.data.vertices[vi].co) for vi in p.vertices)]
        if not faces:
            return None
        obj = extract_faces(body, faces, f"{name}_{name_suffix}", offset)
        mod = obj.modifiers.new("Solidify", "SOLIDIFY")
        mod.thickness = thickness
        mod.offset = -1.0
        set_material(obj, simple_material(f"{name}_mat_{name_suffix}", color, roughness))
        out.append((obj, None))
        m.setdefault("layers", {})[name_suffix] = obj
        return obj

    torso_half_w = m["torso_half_w"]
    if spec.get("vest"):
        # colete: tronco (sem braços), do quadril até abaixo do pescoço
        layer("vest", lambda co: abs(co.x - spine2.x) < torso_half_w + 0.01 and hips_z + 0.02 < co.z < neck.z - 0.03 and not (co.z > spine2.z + 0.08 and abs(co.x - spine2.x) > torso_half_w - 0.06), 0.022, spec["vest"], 0.85, 0.006)
    if spec.get("apron"):
        # avental: frente do tronco e das coxas
        layer("apron", lambda co: co.y < hips.y - 0.03 and abs(co.x - hips.x) < 0.17 and hips_z - 0.38 < co.z < spine2_z + 0.02, 0.02, spec["apron"], 0.9, 0.004)
    if spec.get("sash"):
        # faixa diagonal do ombro esquerdo ao quadril direito (frente e costas)
        def sash_keep(co):
            t = (co.z - (hips_z + 0.05)) / max(0.01, (neck.z - 0.02) - (hips_z + 0.05))  # 0 no quadril, 1 no ombro
            cx = spine2.x + (-0.09 + 0.20 * t)
            return 0.0 <= t <= 1.05 and abs(co.x - cx) < 0.032 and abs(co.x - spine2.x) < torso_half_w + 0.02
        layer("sash", sash_keep, 0.024, spec["sash"], 0.5, 0.004)
    if spec.get("coat"):
        # jaleco: tronco + quadril + coxas até acima do joelho
        layer("coat", lambda co: hips_z - 0.30 < co.z < neck.z - 0.03 and (abs(co.x - spine2.x) < torso_half_w + 0.02 or co.z < spine2_z - 0.05) and not (co.z > spine2.z + 0.06 and abs(co.x - spine2.x) > torso_half_w - 0.05), 0.02, spec["coat"], 0.88, 0.005)
    # solas dos sapatos
    # sola da cor da bota (opt-in pela especificação): mesmo material, um draw call a menos
    sole_mat = simple_material(f"{name}_mat_sole", spec.get("sole", "#1a1816"), 0.6 if spec.get("sole") == spec["boots"] else 0.9)
    for side, bone in (("l", "mixamorig:LeftFoot"), ("r", "mixamorig:RightFoot")):
        foot = joints[bone]
        toe = joints[f"mixamorig:{'Left' if side == 'l' else 'Right'}ToeBase"]
        center = (foot + toe) / 2
        length = (toe - foot).length + 0.14
        yaw = -math.atan2(toe.x - foot.x, -(toe.y - foot.y))
        sole = add_primitive("cube", f"{name}_sole_{side}", Vector((center.x, center.y + 0.015, 0.014)), scale=(0.105 * scale, length, 0.028), rotation=(0, 0, yaw))
        bevel(sole, 0.01, 2)
        set_material(sole, sole_mat)
        out.append((sole, bone))
    return out


def material_key(mat):
    """Assinatura de um material de cor chapada (None para texturizados: pele bakeada, olhos)."""
    if mat is None or not mat.use_nodes:
        return None
    nodes = mat.node_tree.nodes
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None or any(n.type == "TEX_IMAGE" for n in nodes):
        return None
    c = bsdf.inputs["Base Color"].default_value
    e = bsdf.inputs["Emission Strength"].default_value
    ec = bsdf.inputs["Emission Color"].default_value
    return (round(c[0], 3), round(c[1], 3), round(c[2], 3), round(bsdf.inputs["Roughness"].default_value, 2),
            round(bsdf.inputs["Metallic"].default_value, 2), round(bsdf.inputs["Alpha"].default_value, 2),
            round(e, 2), tuple(round(x, 3) for x in ec[:3]) if e > 0 else None, mat.blend_method)


def consolidate(objs: list) -> list:
    """Cada malha vira um draw call no Babylon: materiais idênticos viram um só e as peças com o mesmo material são
    fundidas numa malha (pesos por nome de osso se preservam no join). Solidify/chanfro são aplicados antes — no join
    só ficam os modificadores do objeto ativo (a armature, igual em todos)."""
    keep, groups, canon = [], {}, {}
    for o in objs:
        if o.type != "MESH" or len(o.data.materials) != 1:
            keep.append(o)
            continue
        k = material_key(o.data.materials[0])
        if k is None:
            keep.append(o)
            continue
        o.data.materials[0] = canon.setdefault(k, o.data.materials[0])
        groups.setdefault(k, []).append(o)
    out = list(keep)
    for k, members in groups.items():
        if len(members) == 1:
            out.append(members[0])
            continue
        for o in members:
            for md in [md for md in o.modifiers if md.type != "ARMATURE"]:
                with bpy.context.temp_override(object=o, active_object=o, selected_objects=[o]):
                    bpy.ops.object.modifier_apply(modifier=md.name)
        target = members[0]
        with bpy.context.temp_override(object=target, active_object=target, selected_objects=members, selected_editable_objects=members):
            bpy.ops.object.join()
        for me in [me for me in bpy.data.meshes if me.users == 0]:
            bpy.data.meshes.remove(me)  # malhas órfãs do join prenderiam o nome (sairia "x.001" no glTF)
        target.name = canon[k].name.replace("_mat_", "_")
        target.data.name = target.name
        out.append(target)
    return out


# ---------------------------------------------------------------------------
# Roupas volumétricas, uniforme, bolsa e armadura — peças projetadas sobre a pele (A-pose do MakeHuman)
# ---------------------------------------------------------------------------
ARM_BONES = {"mixamorig:LeftArm", "mixamorig:LeftForeArm", "mixamorig:LeftHand",
             "mixamorig:RightArm", "mixamorig:RightForeArm", "mixamorig:RightHand"}
UP = Vector((0.0, 0.0, 1.0))
FRONT = Vector((0.0, -1.0, 0.0))
PAPER = "#ece6d6"


class BodySurface:
    """Pele em resolução cheia (antes do decimate), na A-pose: raios que saem de um eixo interno acham a superfície.
    Com `outer=True` o raio vem de fora para dentro e acha a camada mais externa naquela direção."""

    outer = False

    def __init__(self, verts: list[Vector], faces):
        self.bvh = BVHTree.FromPolygons([tuple(v) for v in verts], [list(vi) for vi, _ in faces])

    def dist(self, origin: Vector, direction: Vector, max_dist: float = 0.6):
        d = direction.normalized()
        if self.outer:
            hit, _n, _i, h = self.bvh.ray_cast(origin + d * max_dist, -d, max_dist)
            return (max_dist - h) if hit is not None else None
        hit, _n, _i, h = self.bvh.ray_cast(origin, d, max_dist)
        return h if hit is not None else None


class LayerSurface(BodySurface):
    """Face externa de camadas de roupa já extraídas (vértices crus; o solidify delas cresce para dentro)."""

    def __init__(self, objs, outer: bool = False):
        verts, polys = [], []
        for o in objs:
            if o is None:
                continue
            base = len(verts)
            verts.extend(v.co.copy() for v in o.data.vertices)
            polys.extend([base + i for i in p.vertices] for p in o.data.polygons)
        self.bvh = BVHTree.FromPolygons(verts, polys)
        self.outer = outer


def axis_basis(axis: Vector, ref: Vector):
    """(a, u, w): eixo normalizado, `ref` projetado perpendicular a ele e a × u (ângulo +90°)."""
    a = axis.normalized()
    u = ref - a * ref.dot(a)
    if u.length < 1e-6:
        u = a.orthogonal()
    u.normalize()
    return a, u, a.cross(u)


def bone_weight(obj, bones: set[str]) -> list[float]:
    idx = {vg.index for vg in obj.vertex_groups if vg.name in bones}
    return [sum(g.weight for g in v.groups if g.group in idx) for v in obj.data.vertices]


def assign_bones(obj, weights: dict[str, float]):
    """Peça rígida dividida entre ossos (ex.: lenço entre pescoço e peito)."""
    for bone, w in weights.items():
        vg = obj.vertex_groups.new(name=bone)
        vg.add(list(range(len(obj.data.vertices))), w, "REPLACE")


def copy_weights(obj, src, k: int = 4):
    """Pesos dos vértices mais próximos da camada de baixo (média por inverso da distância): a peça deforma com ela."""
    kd = KDTree(len(src.data.vertices))
    for v in src.data.vertices:
        kd.insert(v.co, v.index)
    kd.balance()
    names = {vg.index: vg.name for vg in src.vertex_groups}
    groups = {}
    for v in obj.data.vertices:
        acc: dict[str, float] = {}
        for _co, idx, dist in kd.find_n(v.co, k):
            wv = 1.0 / max(dist, 1e-3)
            for g in src.data.vertices[idx].groups:
                acc[names[g.group]] = acc.get(names[g.group], 0.0) + g.weight * wv
        total = sum(acc.values())
        if total <= 0:
            continue
        kept = {b: w for b, w in acc.items() if w / total >= 0.03}
        norm = sum(kept.values())
        for bname, w in kept.items():
            vg = groups.get(bname)
            if vg is None:
                vg = groups[bname] = obj.vertex_groups.new(name=bname)
            vg.add([v.index], w / norm, "REPLACE")


def push_outside(obj, layer: BodySurface, gap: float, max_dist: float = 0.03):
    """Vértices dentro da camada (ou a menos de `gap` dela) saem pela normal da face mais próxima. Só vale perto da
    camada (`max_dist`): longe dela a face mais próxima é uma borda e a normal não diz o que é dentro ou fora."""
    for v in obj.data.vertices:
        loc, n, _i, d = layer.bvh.find_nearest(v.co, max_dist)
        if loc is None:
            continue
        h = (v.co - loc).dot(n)
        if h < gap:
            v.co = v.co + n * (gap - h)
    obj.data.update()


def drape(obj, p_top: Vector, p_bot: Vector, start_t: float, select=None, flare: float = 0.0, bins: int = 40,
          front: Vector = FRONT, smooth_iters: int = 2) -> int:
    """Tecido que cai reto ao longo de um eixo: abaixo de `start_t` cada vértice fica pelo menos tão afastado do eixo
    quanto o ponto mais largo acima dele no mesmo setor angular (não cola na cintura/canela). `flare` abre a barra."""
    axis = p_bot - p_top
    length = axis.length
    a, u, w = axis_basis(axis, front)
    items = []
    for v in obj.data.vertices:
        if select is not None and not select(v):
            continue
        d = v.co - p_top
        along = d.dot(a)
        t = along / length
        if t < 0.0 or t > 1.0:
            continue
        rad = d - a * along
        r = rad.length
        if r < 1e-5:
            continue
        ang = math.atan2(rad.dot(w), rad.dot(u))
        items.append((t, int((ang + math.pi) / TAU * bins) % bins, r, v.index, rad / r))
    items.sort(key=lambda it: it[0])
    run = [0.0] * bins
    moved = []
    for t, b, r, idx, dirv in items:
        if t >= start_t:
            # vizinhança angular larga: o tecido passa por cima de sulcos estreitos (coluna, glúteos)
            prof = max(run[b], 0.99 * run[(b - 1) % bins], 0.99 * run[(b + 1) % bins], 0.975 * run[(b - 2) % bins], 0.975 * run[(b + 2) % bins])
            target = prof * (1.0 + flare * (t - start_t) / max(1e-3, 1.0 - start_t))
            if target > r:
                obj.data.vertices[idx].co = obj.data.vertices[idx].co + dirv * (target - r)
                moved.append(idx)
        run[b] = max(run[b], r)
    if moved and smooth_iters:
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.verts.ensure_lookup_table()
        sel = [bm.verts[i] for i in set(moved)]
        for _ in range(smooth_iters):
            bmesh.ops.smooth_vert(bm, verts=sel, factor=0.4, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        bm.to_mesh(obj.data)
        bm.free()
    obj.data.update()
    return len(moved)


def drape_torso(obj, joints, m) -> int:
    """Túnica/jaqueta: do peito para baixo o tecido cai reto (não acompanha a cintura); braços ficam de fora."""
    hips, spine2 = joints["mixamorig:Hips"], joints["mixamorig:Spine2"]
    cy = (m["torso_front"] + m["torso_back"]) / 2
    top = Vector((0.0, cy, spine2.z + 0.10))
    bot = Vector((0.0, cy, hips.z - 0.25))
    arm_w = bone_weight(obj, ARM_BONES)
    half = m["torso_half_w"] + 0.07
    start = (top.z - (spine2.z - 0.02)) / (top.z - bot.z)
    return drape(obj, top, bot, start, select=lambda v: arm_w[v.index] < 0.3 and abs(v.co.x) < half, flare=0.05, bins=48)


def drape_cuffs(obj, joints) -> int:
    """Mangas soltas: do meio do antebraço ao punho a manga não afina com o braço."""
    n = 0
    for side in ("Left", "Right"):
        elbow, wrist = joints[f"mixamorig:{side}ForeArm"], joints[f"mixamorig:{side}Hand"]
        fw = bone_weight(obj, {f"mixamorig:{side}ForeArm", f"mixamorig:{side}Hand"})
        n += drape(obj, elbow, wrist + (wrist - elbow) * 0.08, 0.45, select=lambda v, fw=fw: fw[v.index] > 0.4,
                   flare=0.05, bins=24, front=UP)
    return n


def drape_legs(obj, joints) -> int:
    """Calça de corte reto: do joelho para baixo a perna da calça cai reta até a barra."""
    n = 0
    for side in ("Left", "Right"):
        knee, ankle = joints[f"mixamorig:{side}Leg"], joints[f"mixamorig:{side}Foot"]
        lw = bone_weight(obj, {f"mixamorig:{side}Leg", f"mixamorig:{side}Foot", f"mixamorig:{side}ToeBase"})
        n += drape(obj, knee + Vector((0, 0, 0.04)), ankle - Vector((0, 0, 0.03)), 0.12, select=lambda v, lw=lw: lw[v.index] > 0.5,
                   flare=0.04, bins=32)
    return n


def fill_concave(obj, iterations: int = 8, factor: float = 0.5):
    """O tecido não entra nos vales do corpo (coluna, entre as escápulas, sulco dos glúteos, sob o peito): suaviza só
    onde a superfície é côncava (vizinhos 'por fora'), sem encolher as partes convexas. Braços e ombros ficam de fora
    (na A-pose a axila é um vale fundo: preenchê-la vira ombreira estufada quando o braço desce)."""
    limb = bone_weight(obj, ARM_BONES)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    for _ in range(iterations):
        bm.normal_update()
        moves = []
        for v in bm.verts:
            if v.is_boundary or not v.link_edges or limb[v.index] > 0.1:
                continue
            avg = sum((e.other_vert(v).co for e in v.link_edges), Vector()) / len(v.link_edges)
            dlt = avg - v.co
            if dlt.dot(v.normal) > 0:
                moves.append((v, dlt * factor))
        for v, dlt in moves:
            v.co += dlt
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def jacket_opening(spec, joints, m):
    """Faixa frontal aberta da jaqueta (zíper aberto) em V suave: meia-largura `open` na barra, +3,5 cm no pescoço
    (linear, para o corte por planos coincidir com o teste); `margin` alarga a faixa."""
    half = spec["jacket"].get("open", 0.05)
    hips, neck = joints["mixamorig:Hips"], joints["mixamorig:Neck"]
    cy = (m["torso_front"] + m["torso_back"]) / 2
    z_lo = hips.z - 0.10
    k = 0.035 / (neck.z - z_lo)

    def width(z: float) -> float:
        return half + k * (z - z_lo)

    def inside(c: Vector, margin: float) -> bool:
        if c.y > cy - 0.01 or c.z > neck.z + 0.02:
            return False
        return abs(c.x) < width(c.z) + margin
    inside.width = width
    inside.cy = cy
    inside.plane = (half, z_lo, k)
    return inside


def cut_garment(obj, hem_z: float | None = None, opening=None, margin: float = 0.0, keep: str = "outside"):
    """Corte limpo por planos (bisect) em vez de bordas em zigue-zague: barra horizontal em `hem_z` e, com `opening`,
    as duas bordas da abertura frontal (planos inclinados x = ±(meia-largura + margin)). keep="outside" apaga a
    abertura (jaqueta); keep="inside" guarda só a faixa (camiseta vista na abertura)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    geom = lambda: bm.verts[:] + bm.edges[:] + bm.faces[:]  # noqa: E731
    if hem_z is not None:
        bmesh.ops.bisect_plane(bm, geom=geom(), plane_co=(0.0, 0.0, hem_z), plane_no=(0.0, 0.0, 1.0), clear_inner=True)
    if opening is not None:
        half, z_lo, k = opening.plane
        for sgn in (1.0, -1.0):
            bmesh.ops.bisect_plane(bm, geom=geom(), plane_co=(sgn * (half + margin), 0.0, z_lo), plane_no=(sgn, 0.0, -k))
        doomed = []
        for f in bm.faces:
            c = f.calc_center_median()
            inside = opening(c, margin)
            if (keep == "outside" and inside) or (keep == "inside" and not inside):
                doomed.append(f)
        bmesh.ops.delete(bm, geom=doomed, context="FACES")
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()


def rounded_outline(c_s: float = 0.2, c_t: float = 0.25, dip: float = 0.0, dip_w: float = 0.5, lift: float = 0.0, point: float = 0.0):
    """Contorno por coluna s -> (t_lo, t_hi) em [0,1]: cantos arredondados (elipse c_s × c_t), recorte parabólico no
    meio da borda de cima (`dip`, ex. gola) ou de baixo (`lift`); `point` afunila a base em ponta (capuz, lenço)."""
    def f(s: float):
        lo, hi = 0.0, 1.0
        ds = min(s, 1.0 - s)
        if c_s > 0 and ds < c_s:
            k = (c_s - ds) / c_s
            inset = c_t * (1.0 - math.sqrt(max(0.0, 1.0 - k * k)))
            lo += inset
            hi -= inset
        q = abs(2.0 * s - 1.0) / max(1e-3, dip_w)
        if dip and q < 1.0:
            hi -= dip * (1.0 - q * q)
        if lift and q < 1.0:
            lo += lift * (1.0 - q * q)
        if point:
            lo += point * abs(2.0 * s - 1.0) ** 1.4
        return lo, max(hi, lo + 0.05)
    return f


def cyl_frame(p0: Vector, p1: Vector, ref: Vector, th0: float, th1: float):
    """Cilindro em volta do eixo p0→p1: s percorre o ângulo th0→th1 (graus; 0 = `ref`), t a altura de p0 a p1."""
    a, u, w = axis_basis(p1 - p0, ref)

    def f(s, t):
        th = math.radians(th0 + (th1 - th0) * s)
        return p0 + (p1 - p0) * t, u * math.cos(th) + w * math.sin(th)
    return f


def sph_frame(center: Vector, front: Vector, up: Vector, az0: float, az1: float, el0: float, el1: float):
    """Esfera: s percorre o azimute az0→az1 (graus; 0 = `front`), t a elevação el0→el1 (graus; 90 = `up`)."""
    up = up.normalized()
    fr = (front - up * front.dot(up)).normalized()
    side = up.cross(fr)

    def f(s, t):
        az = math.radians(az0 + (az1 - az0) * s)
        el = math.radians(el0 + (el1 - el0) * t)
        return center, (fr * math.cos(az) + side * math.sin(az)) * math.cos(el) + up * math.sin(el)
    return f


def mesh_object(name: str, pts: list[Vector], faces: list[tuple], outward: list[Vector] | None, mat):
    """Objeto a partir de pontos/faces; vira as faces para que as normais sigam `outward` (um vetor por ponto)."""
    if outward is not None and faces:
        score = 0.0
        for f in faces:
            a, b, c = pts[f[0]], pts[f[1]], pts[f[-1]]
            score += (b - a).cross(c - a).dot(outward[f[0]])
        if score < 0:
            faces = [tuple(reversed(f)) for f in faces]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(p) for p in pts], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    for p in mesh.polygons:
        p.use_smooth = True
    set_material(obj, mat)
    return obj


def thicken(obj, thickness: float, bevel_w: float = 0.0):
    """Espessura para dentro (as normais apontam para fora) e chanfro nas bordas (placas rígidas)."""
    if thickness:
        mod = obj.modifiers.new("Solidify", "SOLIDIFY")
        mod.thickness = thickness
        mod.offset = -1.0
        mod.use_rim = True
        mod.use_even_offset = True
    if bevel_w:
        bv = obj.modifiers.new("Bevel", "BEVEL")
        bv.width = bevel_w
        bv.segments = 1
        bv.limit_method = "ANGLE"
        bv.angle_limit = math.radians(35)
    return obj


def surface_patch(name: str, surf: BodySurface, frame, nu: int, nv: int, offset, outline, mat, thickness: float = 0.01,
                  bevel_w: float = 0.0, smooth: int = 2, closed: bool = False, pole=None, fallback: float = 0.12):
    """Peça que acompanha a superfície: grade (s, t) com contorno `outline(s) -> (t_lo, t_hi)`; cada vértice é a
    superfície no raio `frame(s, t) -> (origem, direção)` + `offset` (número ou função de s, t). `closed` fecha em s;
    `pole=(origem, direção)` fecha o topo com um leque (capacete)."""
    cols = nu if closed else nu + 1
    pts, dirs = [], []
    last = fallback
    for j in range(nv + 1):
        for i in range(cols):
            s = i / nu
            lo, hi = outline(s)
            t = lo + (hi - lo) * j / nv
            o, d = frame(s, t)
            d = d.normalized()
            dist = surf.dist(o, d)
            if dist is None:
                dist = last
            last = dist
            off = offset(s, t) if callable(offset) else offset
            pts.append(o + d * (dist + off))
            dirs.append(d)
    faces = []
    for j in range(nv):
        for i in range(nu):
            i2 = (i + 1) % cols if closed else i + 1
            faces.append((j * cols + i, j * cols + i2, (j + 1) * cols + i2, (j + 1) * cols + i))
    if pole is not None:
        o, d = pole
        d = d.normalized()
        dist = surf.dist(o, d) or last
        off = offset(0.5, 1.0) if callable(offset) else offset
        pts.append(o + d * (dist + off))
        dirs.append(d)
        top = nv * cols
        for i in range(cols):
            faces.append((top + i, top + (i + 1) % cols, len(pts) - 1))
    obj = mesh_object(name, pts, faces, dirs, mat)
    if smooth:
        smooth_mesh(obj, iterations=smooth, factor=0.5)
    return thicken(obj, thickness, bevel_w)


def ring_band(name: str, surf: BodySurface, p0: Vector, p1: Vector, n: int, t_rows: list[float], offset, mat,
              thickness: float = 0.004, ref: Vector = FRONT, max_r: float | None = None, bevel_w: float = 0.0, uniform: bool = False):
    """Faixa fechada em volta de um eixo (gola, cinto, braçadeira): um anel por altura `t_rows` (0..1 de p0 a p1),
    raio = superfície + `offset` (valor ou lista por anel). `uniform`: mesmo raio em todas as alturas (o maior),
    para um cinto reto que passa por cima de uma borda (barra do colete) sem degrau."""
    a, u, w = axis_basis(p1 - p0, ref)
    radii = []
    for t in t_rows:
        o = p0 + (p1 - p0) * t
        last = None
        row = []
        for i in range(n):
            th = TAU * i / n
            d = u * math.cos(th) + w * math.sin(th)
            dist = surf.dist(o, d)
            if dist is None:
                dist = last if last is not None else 0.1
            if max_r is not None:
                dist = min(dist, max_r)
            last = dist
            row.append(dist)
        radii.append(row)
    if uniform:
        top = [max(r[i] for r in radii) for i in range(n)]
        radii = [top for _ in t_rows]
    pts, dirs = [], []
    for k, t in enumerate(t_rows):
        off = offset[k] if isinstance(offset, (list, tuple)) else offset
        o = p0 + (p1 - p0) * t
        for i in range(n):
            th = TAU * i / n
            d = u * math.cos(th) + w * math.sin(th)
            pts.append(o + d * (radii[k][i] + off))
            dirs.append(d)
    faces = [(k * n + i, k * n + (i + 1) % n, (k + 1) * n + (i + 1) % n, (k + 1) * n + i) for k in range(len(t_rows) - 1) for i in range(n)]
    obj = mesh_object(name, pts, faces, dirs, mat)
    return thicken(obj, thickness, bevel_w)


def sweep_tube(name: str, path: list[Vector], radius, segs: int, mat, up: Vector, closed: bool = False):
    """Tubo ao longo de uma polilinha (lenço, rolo do capuz); `radius` valor ou função de u ∈ [0,1]."""
    n = len(path)
    pts, dirs = [], []
    for k, p in enumerate(path):
        if closed:
            tan = (path[(k + 1) % n] - path[k - 1]).normalized()
        else:
            tan = (path[min(k + 1, n - 1)] - path[max(k - 1, 0)]).normalized()
        nrm = (up - tan * up.dot(tan)).normalized()
        bi = tan.cross(nrm)
        r = radius(k / max(1, n - 1)) if callable(radius) else radius
        for i in range(segs):
            ang = TAU * i / segs
            d = nrm * math.cos(ang) + bi * math.sin(ang)
            pts.append(p + d * r)
            dirs.append(d)
    faces = []
    for k in range(n if closed else n - 1):
        k2 = (k + 1) % n
        for i in range(segs):
            i2 = (i + 1) % segs
            faces.append((k * segs + i, k * segs + i2, k2 * segs + i2, k2 * segs + i))
    obj = mesh_object(name, pts, faces, dirs, mat)
    if not closed:
        # tampas nas pontas (o material é de dupla face: a orientação delas não importa)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bmesh.ops.holes_fill(bm, edges=bm.edges, sides=64)
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        for p in obj.data.polygons:
            p.use_smooth = True
    return obj


def surface_matrix(surf: BodySurface, origin: Vector, direction: Vector, offset: float, up: Vector = UP) -> Matrix:
    """Matriz de um ponto da superfície no raio (origem, direção): Z local = direção do raio, Y local ≈ `up`."""
    d = direction.normalized()
    dist = surf.dist(origin, d)
    p = origin + d * ((dist if dist is not None else 0.1) + offset)
    x = up.cross(d)
    if x.length < 1e-6:
        x = d.orthogonal()
    x.normalize()
    y = d.cross(x)
    mat = Matrix((x, y, d)).transposed().to_4x4()
    mat.translation = p
    return mat


def part(kind: str, name: str, world: Matrix, size, material, bevel_w: float = 0.0, **kw):
    """Primitiva com dimensões `size` (X, Y, Z locais; cilindro/esfera: diâmetros e altura) posta pela matriz `world`."""
    obj = add_primitive(kind, name, Vector((0, 0, 0)), scale=size, **kw)
    if bevel_w:
        bevel(obj, bevel_w, 2)
    obj.data.transform(world)
    obj.data.update()
    set_material(obj, material)
    return obj


def T(x: float, y: float, z: float) -> Matrix:
    return Matrix.Translation(Vector((x, y, z)))


def church_emblem(name: str, world: Matrix, size: float, mat) -> list:
    """Emblema da Igreja (iconografia própria do projeto, ver make_environment.py): anel, eixo vertical e semente."""
    ring = part("torus", f"{name}_anel", world, (1, 1, 1), mat, major=size * 0.5, minor=size * 0.065, major_segments=20, minor_segments=6)
    axis = part("cube", f"{name}_eixo", world, (size * 0.13, size * 1.3, size * 0.09), mat)
    seed = part("sphere", f"{name}_semente", world @ T(0, 0, size * 0.03), (size * 0.26, size * 0.26, size * 0.16), mat, segments=10, rings=6)
    return [ring, axis, seed]


def catmull_rom(points: list[Vector], samples: int, closed: bool) -> list[Vector]:
    n = len(points)
    out = []
    segs = n if closed else n - 1
    for k in range(segs):
        p0 = points[(k - 1) % n] if closed else points[max(k - 1, 0)]
        p1 = points[k]
        p2 = points[(k + 1) % n] if closed else points[min(k + 1, n - 1)]
        p3 = points[(k + 2) % n] if closed else points[min(k + 2, n - 1)]
        for i in range(samples):
            t = i / samples
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(points[-1].copy())
    return out


def ribbon(name: str, layer: BodySurface, guides: list[Vector], width: float, offset: float, mat, thickness: float = 0.004,
           closed: bool = True, samples: int = 8, tension: int = 3):
    """Alça/fita deitada sobre a camada: spline pelos pontos-guia, projetada no ponto mais próximo da superfície e
    esticada (suaviza e volta para fora algumas vezes, como uma alça tensionada sobre a abertura da jaqueta)."""
    path = catmull_rom(guides, samples, closed)
    n = len(path)
    pts, nrm = [], []
    for q in path:
        loc, nn, _i, _d = layer.bvh.find_nearest(q)
        pts.append(loc + nn * offset)
        nrm.append(nn.copy())
    for _ in range(tension):
        sm = []
        for k in range(n):
            if not closed and (k == 0 or k == n - 1):
                sm.append(pts[k])
                continue
            sm.append((pts[k - 1] + pts[k] * 2 + pts[(k + 1) % n]) / 4)
        pts = []
        for k, q in enumerate(sm):
            loc, nn, _i, _d = layer.bvh.find_nearest(q)
            h = (q - loc).dot(nn)
            pts.append(q + nn * (offset - h) if h < offset else q)
            nrm[k] = nn.copy()
    verts, dirs = [], []
    for k in range(n):
        tan = pts[(k + 1) % n] - pts[k - 1] if closed else pts[min(k + 1, n - 1)] - pts[max(k - 1, 0)]
        side = tan.cross(nrm[k]).normalized()
        verts += [pts[k] - side * width / 2, pts[k] + side * width / 2]
        dirs += [nrm[k], nrm[k]]
    faces = [(2 * k, 2 * k + 1, 2 * ((k + 1) % n) + 1, 2 * ((k + 1) % n)) for k in range(n if closed else n - 1)]
    obj = mesh_object(name, verts, faces, dirs, mat)
    return thicken(obj, thickness)


def build_outfit(name: str, spec: dict, surf: BodySurface, joints, verts, vgroups, m: dict, cloth: dict, body) -> list:
    """Peças extras por especificação; devolve [(objeto, osso | None)] — None quando os pesos já foram definidos."""
    out = []
    if spec.get("uniform"):
        out += build_uniform(name, spec, surf, joints, m, cloth, body)
    if spec.get("clipboard"):
        out += build_clipboard(name, joints)
    if spec.get("jacket") and cloth.get("jacket") is not None:
        out += build_jacket_extras(name, spec, surf, joints, m, cloth)
    if spec.get("scarf"):
        out += build_scarf(name, spec, surf, joints, m, cloth)
    if spec.get("crossbody_bag"):
        out += build_crossbody_bag(name, spec, surf, joints, m, cloth, body)
    if spec.get("armor"):
        out += build_armor(name, spec, surf, joints, verts, vgroups, m, cloth, body)
    return out


def build_uniform(name: str, spec: dict, surf: BodySurface, joints, m: dict, cloth: dict, body) -> list:
    """Farda de oficial de distribuição (sem armadura): gola alta, vista com botões, bolsos de peito com lapela,
    dragonas com filete de cobre, insígnia geométrica, faixa de cobre no braço, crachá e cinto."""
    u = spec["uniform"]
    out = []
    jk = cloth["shirt"]
    layer = LayerSurface([jk])
    J = lambda b: joints[f"mixamorig:{b}"]  # noqa: E731
    hips, spine, spine2, neck, head = J("Hips"), J("Spine"), J("Spine2"), J("Neck"), J("Head")
    cy = (m["torso_front"] + m["torso_back"]) / 2
    cloth_mat = jk.data.materials[0]
    # poucas cores (cada material = 1 draw call): cinza da gola/lapelas/vista, cobre (filetes, faixa, fivela),
    # escuro (botões, cinto, foto do crachá), índigo, papel (crachá e prancheta)
    grey = simple_material(f"{name}_mat_collar", u["collar"], 0.85)
    placket_mat = grey
    trim = simple_material(f"{name}_mat_trim", u["trim"], 0.4, 0.75)
    band_mat = trim
    button = simple_material(f"{name}_mat_dark", u["button"], 0.5, 0.2)
    indigo = simple_material(f"{name}_mat_indigo", u["indigo"], 0.6)
    belt_mat = button
    buckle_mat = trim
    card_mat = simple_material(f"{name}_mat_paper", PAPER, 0.85)
    photo_mat = button

    def follow(obj, src=jk):
        copy_weights(obj, src)
        out.append((obj, None))
        return obj

    def at(theta: float):
        th = math.radians(theta)
        return Vector((math.sin(th), -math.cos(th), 0.0))

    # gola alta em volta da base do pescoço (pesos da pele do pescoço/peito)
    ndir = (head - neck).normalized()
    collar = ring_band(f"{name}_collar", surf, neck - ndir * 0.03, neck + ndir * 0.05, 28, [0.0, 0.45, 1.0],
                       [0.024, 0.019, 0.016], grey, thickness=0.005, max_r=0.075)
    follow(collar, body)
    pip = ring_band(f"{name}_collar_piping", surf, neck - ndir * 0.03, neck + ndir * 0.05, 28, [0.9, 1.0],
                    [0.0172, 0.0166], trim, thickness=0.003, max_r=0.075)
    follow(pip, body)
    # vista frontal com botões
    z_hem = hips.z + spec.get("shirt_hem", -0.1)
    z_top = neck.z - 0.045
    fr = cyl_frame(Vector((0, cy, z_hem + 0.015)), Vector((0, cy, z_top)), FRONT, -3.2, 3.2)
    follow(surface_patch(f"{name}_placket", layer, fr, 2, 16, 0.002, rounded_outline(0, 0), placket_mat, thickness=0.003, smooth=1))
    z_belt = (spine.z + hips.z) / 2 + 0.01
    for k in range(6):
        z = z_top - 0.035 - k * (z_top - 0.035 - (z_hem + 0.04)) / 5
        if abs(z - z_belt) < 0.035:
            continue
        mtx = surface_matrix(layer, Vector((0, cy, z)), FRONT, 0.005)
        follow(part("cylinder", f"{name}_button_{k}", mtx, (0.015, 0.015, 0.004), button, vertices=10))
    # bolsos de peito com lapela e botão
    z0, z1 = spine2.z - 0.055, spine2.z + 0.07
    for sgn, tag in ((1, "l"), (-1, "r")):
        thc = 27.0 * sgn
        fr = cyl_frame(Vector((0, cy, z0)), Vector((0, cy, z1)), FRONT, thc - 17, thc + 17)
        follow(surface_patch(f"{name}_pocket_{tag}", layer, fr, 6, 4, 0.0035, rounded_outline(0.12, 0.1), cloth_mat, thickness=0.004, smooth=1))
        fr = cyl_frame(Vector((0, cy, z1 - 0.014)), Vector((0, cy, z1 + 0.03)), FRONT, thc - 18.5, thc + 18.5)
        follow(surface_patch(f"{name}_flap_{tag}", layer, fr, 6, 2, 0.008, rounded_outline(0.1, 0.2, lift=-0.35, dip_w=0.7), grey, thickness=0.004, smooth=1))
        mtx = surface_matrix(layer, Vector((0, cy, z1 - 0.016)), at(thc), 0.0125)
        follow(part("cylinder", f"{name}_pocket_button_{tag}", mtx, (0.013, 0.013, 0.004), button, vertices=10))
    # insígnia geométrica (hexágono de cobre com miolo índigo) acima do bolso esquerdo
    mtx = surface_matrix(layer, Vector((0, cy, z1 + 0.058)), at(27.0), 0.004)
    follow(part("cylinder", f"{name}_insignia", mtx @ Matrix.Rotation(math.radians(30), 4, "Z"), (0.046, 0.046, 0.004), trim, vertices=6))
    follow(part("cylinder", f"{name}_insignia_core", mtx @ T(0, 0, 0.0026) @ Matrix.Rotation(math.radians(30), 4, "Z"), (0.028, 0.028, 0.003), indigo, vertices=6))
    follow(part("cylinder", f"{name}_insignia_dot", mtx @ T(0, 0, 0.0045), (0.009, 0.009, 0.002), trim, vertices=8))
    # crachá preso no bolso direito
    mtx = surface_matrix(layer, Vector((0, cy, z0 + 0.06)), at(-27.0), 0.0105)
    follow(part("cube", f"{name}_badge", mtx, (0.054, 0.082, 0.0025), card_mat, bevel_w=0.001))
    follow(part("cube", f"{name}_badge_photo", mtx @ T(0, 0.011, 0.0015), (0.026, 0.031, 0.001), photo_mat))
    follow(part("cube", f"{name}_badge_band", mtx @ T(0, -0.028, 0.0015), (0.048, 0.011, 0.001), indigo))
    follow(part("cube", f"{name}_badge_clip", mtx @ T(0, 0.044, 0.001), (0.014, 0.013, 0.004), trim))
    # dragonas sobre os ombros, com filete de cobre e botão
    for side in ("Left", "Right"):
        sh, armj = J(f"{side}Shoulder"), J(f"{side}Arm")
        p0 = sh + (armj - sh) * 0.2
        p1 = armj + (armj - sh).normalized() * 0.035
        follow(surface_patch(f"{name}_epaulette_{side[0]}", layer, cyl_frame(p0, p1, UP, -30, 30), 4, 6, 0.005,
                             rounded_outline(0.3, 0.12), grey, thickness=0.005, bevel_w=0.0015, smooth=1))
        follow(surface_patch(f"{name}_epaulette_stripe_{side[0]}", layer, cyl_frame(p0 + (p1 - p0) * 0.74, p0 + (p1 - p0) * 0.86, UP, -31, 31), 4, 1, 0.0105,
                             rounded_outline(0, 0), trim, thickness=0.002, smooth=0))
        mtx = surface_matrix(layer, p0 + (p1 - p0) * 0.12, UP, 0.0105, up=(p1 - p0).normalized())
        follow(part("cylinder", f"{name}_epaulette_button_{side[0]}", mtx, (0.012, 0.012, 0.004), button, vertices=10))
    # faixa de cobre no braço esquerdo (a mesma cor da faixa do Atlas do depósito)
    sh, el = J("LeftArm"), J("LeftForeArm")
    follow(ring_band(f"{name}_armband", layer, sh, el, 20, [0.40, 0.56], 0.0025, band_mat, thickness=0.003))
    # cinto sobre a túnica, com fivela
    belt = ring_band(f"{name}_belt", layer, Vector((0, cy, z_belt - 0.019)), Vector((0, cy, z_belt + 0.019)), 40, [0.0, 1.0], 0.003, belt_mat, thickness=0.006)
    follow(belt)
    mtx = surface_matrix(LayerSurface([belt]), Vector((0, cy, z_belt)), FRONT, 0.003)
    follow(part("cube", f"{name}_buckle", mtx, (0.055, 0.044, 0.007), buckle_mat, bevel_w=0.003))
    return out


def build_clipboard(name: str, joints) -> list:
    """Prancheta na mão esquerda, no plano da palma, pendendo além dos dedos (presa pela borda de cima)."""
    hand, mid = joints["mixamorig:LeftHand"], joints["mixamorig:LeftHandMiddle1"]
    idx, pinky = joints["mixamorig:LeftHandIndex1"], joints["mixamorig:LeftHandPinky1"]
    hand_dir = (mid - hand).normalized()
    across = idx - pinky
    across = (across - hand_dir * across.dot(hand_dir)).normalized()
    normal = hand_dir.cross(across)
    if normal.z < 0:  # papel para o dorso da mão (para fora, com o braço caído)
        normal = -normal
        across = -across
    rot = Matrix((across, hand_dir, normal)).transposed().to_4x4()
    top = mid + hand_dir * 0.035
    world = T(*(top + hand_dir * 0.155)) @ rot
    board_mat = simple_material(f"{name}_mat_clipboard", "#7d6248", 0.7)
    paper_mat = simple_material(f"{name}_mat_paper", PAPER, 0.85)
    metal = simple_material(f"{name}_mat_trim", "#b06a3b", 0.4, 0.75)  # presilha de cobre (mesmo material dos filetes)
    ink = simple_material(f"{name}_mat_dark", "#2a2b2e", 0.5, 0.2)
    out = [
        part("cube", f"{name}_clipboard", world, (0.225, 0.31, 0.007), board_mat, bevel_w=0.003),
        part("cube", f"{name}_clipboard_paper", world @ T(0, 0.012, 0.0045), (0.205, 0.265, 0.0012), paper_mat),
        part("cube", f"{name}_clipboard_clip", world @ T(0, -0.133, 0.0065), (0.085, 0.032, 0.008), metal, bevel_w=0.002),
    ]
    for k in range(5):  # linhas da lista de saída (só tom, sem texto legível)
        out.append(part("cube", f"{name}_clipboard_line_{k}", world @ T(-0.01, 0.06 - k * 0.032, 0.0053), (0.16 - (k % 2) * 0.04, 0.005, 0.0006), ink))
    return [(o, "mixamorig:LeftHand") for o in out]


def build_jacket_extras(name: str, spec: dict, surf: BodySurface, joints, m: dict, cloth: dict) -> list:
    """Jaqueta do mensageiro: capuz abaixado (rolo atrás do pescoço + bolsa deitada nas costas) e remendos nos cotovelos."""
    j = spec["jacket"]
    jk = cloth["jacket"]
    out = []
    layer = LayerSurface([jk])
    J = lambda b: joints[f"mixamorig:{b}"]  # noqa: E731
    neck, head, spine2 = J("Neck"), J("Head"), J("Spine2")
    cy = (m["torso_front"] + m["torso_back"]) / 2
    jmat = jk.data.materials[0]
    if j.get("hood"):
        ndir = (head - neck).normalized()
        o = neck - ndir * 0.03
        path = []
        for k in range(17):
            th = math.radians(-118 + 236 * k / 16)  # 0 = costas; ±118° chega à frente dos ombros
            d = Vector((math.sin(th), math.cos(th), 0.0))
            dist = min(surf.dist(o, d) or 0.07, 0.085)
            path.append(o + d * (dist + 0.032) - UP * (0.02 * abs(math.sin(th)) ** 2))
        roll = sweep_tube(f"{name}_hood_roll", path, lambda uu: 0.017 + 0.019 * math.sin(math.pi * uu) ** 0.6, 10, jmat, up=ndir)
        copy_weights(roll, jk)
        out.append((roll, None))
        # bolsa do capuz deitada nas costas: almofada em ponta, mais estufada no meio
        z_top, z_bot = neck.z - 0.035, spine2.z - 0.04
        fr = cyl_frame(Vector((0, cy, z_bot)), Vector((0, cy, z_top)), FRONT, 180 - 38, 180 + 38)
        sack = surface_patch(f"{name}_hood", layer, fr, 8, 6, lambda s, t: 0.006 + 0.032 * math.sin(math.pi * s) * math.sin(math.pi * min(1.0, 0.25 + 0.75 * t)) ** 0.8,
                             rounded_outline(0.3, 0.2, point=0.55), jmat, thickness=0.005, smooth=2)
        copy_weights(sack, jk)
        out.append((sack, None))
    if j.get("patches"):
        pmat = simple_material(f"{name}_mat_strap", spec["crossbody_bag"]["strap"], 0.85) if spec.get("crossbody_bag") else simple_material(f"{name}_mat_patch", j["patches"], 0.92)  # remendos de couro = alça
        for side in ("Left", "Right"):
            sh, el, wr = J(f"{side}Arm"), J(f"{side}ForeArm"), J(f"{side}Hand")
            ua = (el - sh).normalized()
            fa = (wr - el).normalized()
            back = -(fa - ua * fa.dot(ua))
            if back.length < 1e-3:
                back = Vector((0, 1, 0))
            fr = cyl_frame(el - ua * 0.055, el + fa * 0.06, back, -48, 48)
            p = surface_patch(f"{name}_elbow_patch_{side[0]}", layer, fr, 5, 4, 0.0025, rounded_outline(0.35, 0.35), pmat, thickness=0.002, smooth=2)
            copy_weights(p, jk)
            out.append((p, None))
    return out


def build_scarf(name: str, spec: dict, surf: BodySurface, joints, m: dict, cloth: dict) -> list:
    """Lenço enrolado na base do pescoço, com a ponta caindo sobre o peito."""
    J = lambda b: joints[f"mixamorig:{b}"]  # noqa: E731
    neck, head, spine2 = J("Neck"), J("Head"), J("Spine2")
    mat = simple_material(f"{name}_mat_scarf", spec["scarf"], 0.92)
    ndir = (head - neck).normalized()
    o = neck - ndir * 0.008
    a, u, w = axis_basis(ndir, FRONT)
    path = []
    for i in range(26):
        th = TAU * i / 26
        d = u * math.cos(th) + w * math.sin(th)
        dist = min(surf.dist(o, d) or 0.06, 0.075)
        path.append(o + d * (dist + 0.017) - ndir * (0.02 * max(0.0, math.cos(th)) ** 2))
    tube = sweep_tube(f"{name}_scarf", path, 0.019, 10, mat, up=ndir, closed=True)
    assign_bones(tube, {"mixamorig:Neck": 0.45, "mixamorig:Spine2": 0.55})
    cy = (m["torso_front"] + m["torso_back"]) / 2
    layers = LayerSurface([cloth.get("shirt"), cloth.get("jacket")], outer=True)
    fr = cyl_frame(Vector((0, cy, neck.z - 0.15)), Vector((0, cy, neck.z - 0.035)), FRONT, -15, 15)
    tip = surface_patch(f"{name}_scarf_tip", layers, fr, 4, 4, 0.01, rounded_outline(0.0, 0.0, point=0.9), mat, thickness=0.006, smooth=1)
    return [(tube, None), (tip, "mixamorig:Spine2")]


def build_crossbody_bag(name: str, spec: dict, surf: BodySurface, joints, m: dict, cloth: dict, body) -> list:
    """Bolsa transversal: alça do ombro direito ao quadril esquerdo (frente e costas); bolsa de lona atrás do quadril
    esquerdo (fora do balanço do braço) com lapela, fivela e papéis aparecendo."""
    b = spec["crossbody_bag"]
    out = []
    J = lambda k: joints[f"mixamorig:{k}"]  # noqa: E731
    hips, spine, spine1, spine2, neck = J("Hips"), J("Spine"), J("Spine1"), J("Spine2"), J("Neck")
    cy = (m["torso_front"] + m["torso_back"]) / 2
    layer = LayerSurface([cloth.get("jacket"), cloth.get("shirt"), cloth.get("pants")])
    strap_mat = simple_material(f"{name}_mat_strap", b["strap"], 0.85)
    bag_mat = simple_material(f"{name}_mat_bag", b["color"], 0.9)
    flap_mat = strap_mat
    metal = strap_mat  # fecho de couro (mesmo material da alça)
    paper = simple_material(f"{name}_mat_papers", b["papers"], 0.85)

    def radial(theta: float, z: float, lift: float = 0.0) -> Vector:
        th = math.radians(theta)
        d = Vector((math.sin(th), -math.cos(th), 0.0))
        o = Vector((0.0, cy, z))
        return o + d * ((layer.dist(o, d) or 0.15) + lift)

    def over_shoulder(x: float, y: float) -> Vector:
        o = Vector((x, y, neck.z - 0.06))
        return o + UP * ((layer.dist(o, UP) or 0.05) + 0.004)

    z_bag_top = hips.z - 0.005
    guides = [
        radial(132, z_bag_top + 0.01),
        radial(165, (spine.z + spine1.z) / 2),
        radial(205, spine2.z + 0.06),
        radial(232, spine2.z + 0.16),
        over_shoulder(-0.105, neck.y + 0.045),
        over_shoulder(-0.10, neck.y - 0.035),
        radial(-38, spine2.z + 0.12),
        radial(12, spine1.z),
        radial(62, spine.z),
        radial(98, z_bag_top + 0.03),
    ]
    strap = ribbon(f"{name}_bag_strap", layer, guides, 0.042, 0.006, strap_mat, thickness=0.004, closed=True, samples=7)
    copy_weights(strap, body)
    out.append((strap, None))
    # bolsa: atrás do quadril esquerdo, face para fora
    th = math.radians(132)
    d = Vector((math.sin(th), -math.cos(th), 0.0))
    zc = z_bag_top - 0.105
    o = Vector((0.0, cy, zc))
    dist = layer.dist(o, d) or 0.16
    x_ax = UP.cross(d).normalized()
    rot = Matrix((x_ax, UP, d)).transposed().to_4x4()
    depth = 0.075
    world = T(*(o + d * (dist + depth / 2 + 0.012))) @ rot
    parts = [
        part("cube", f"{name}_bag", world, (0.27, 0.21, depth), bag_mat, bevel_w=0.014),
        part("cube", f"{name}_bag_flap", world @ T(0, 0.036, depth / 2 + 0.004), (0.282, 0.15, 0.012), flap_mat, bevel_w=0.005),
        part("cube", f"{name}_bag_buckle", world @ T(0, -0.032, depth / 2 + 0.012), (0.032, 0.036, 0.006), metal, bevel_w=0.002),
        part("cube", f"{name}_bag_paper_a", world @ T(-0.03, 0.105, -0.008) @ Matrix.Rotation(math.radians(-6), 4, "Z"), (0.19, 0.13, 0.003), paper),
        part("cube", f"{name}_bag_paper_b", world @ T(0.035, 0.112, -0.016) @ Matrix.Rotation(math.radians(5), 4, "Z"), (0.15, 0.13, 0.003), paper),
    ]
    out += [(p, "mixamorig:Hips") for p in parts]
    return out


def build_armor(name: str, spec: dict, surf: BodySurface, joints, verts, vgroups, m: dict, cloth: dict, body) -> list:
    """Custódio: proteção humana fabricável — placas de cerâmica segmentadas (peito, abdômen em lâminas, costas,
    ombreiras em duas lâminas, antebraços, joelheiras e caneleiras) sobre colete índigo com bolsos, cinto de serviço,
    capacete de polímero com viseira levantada; detalhes de cobre. Nada de exoesqueleto nem silhueta de super-herói."""
    a = spec["armor"]
    out = []
    J = lambda k: joints[f"mixamorig:{k}"]  # noqa: E731
    hips, spine, spine1, spine2, neck, head = J("Hips"), J("Spine"), J("Spine1"), J("Spine2"), J("Neck"), J("Head")
    cy = (m["torso_front"] + m["torso_back"]) / 2
    plate = simple_material(f"{name}_mat_plate", a["plate"], 0.42, 0.05)
    helmet_mat = plate
    trim = simple_material(f"{name}_mat_trim", a["trim"], 0.32, 0.85)
    indigo = simple_material(f"{name}_mat_indigo", a["indigo"], 0.55)
    visor = simple_material(f"{name}_mat_visor", a["visor"], 0.12, 0.35)
    pouch = simple_material(f"{name}_mat_vest", spec["vest"], 0.85)  # mesma assinatura do colete: funde com ele
    belt_mat = simple_material(f"{name}_mat_boots", spec["boots"], 0.6)  # idem botas
    metal = simple_material(f"{name}_mat_boots", spec["boots"], 0.6)  # lanterna de polímero preto (= botas)
    lens = visor  # lente apagada de dia: vidro fumê da viseira
    vest, shirt, pants = cloth.get("vest"), cloth.get("shirt"), cloth.get("pants")
    torso = LayerSurface([vest, shirt], outer=True)
    sleeve = LayerSurface([shirt])
    legs = LayerSurface([pants])

    def rigid(obj, bone):
        out.append((obj, bone))
        return obj

    # placas sobre o corpo seguem os pesos da camada de baixo: rígidas num osso só, a camada (pesada entre vários
    # ossos) as atravessaria assim que a coluna ou o membro se movesse

    def follow(obj, src):
        copy_weights(obj, src)
        out.append((obj, None))
        return obj

    def tframe(z0, z1, th0, th1):
        return cyl_frame(Vector((0, cy, z0)), Vector((0, cy, z1)), FRONT, th0, th1)

    def at(theta: float):
        th = math.radians(theta)
        return Vector((math.sin(th), -math.cos(th), 0.0))

    # --- peito: placa com recorte de gola, filete de cobre e emblema da Igreja
    z0, z1 = spine2.z - 0.075, neck.z - 0.035
    chest_out = rounded_outline(0.22, 0.28, dip=0.24, dip_w=0.42)
    follow(surface_patch(f"{name}_plate_chest", torso, tframe(z0, z1, -50, 50), 10, 7, 0.017, chest_out, plate, thickness=0.012, bevel_w=0.003), vest)
    follow(surface_patch(f"{name}_trim_chest", torso, tframe(z0, z1, -50, 50), 12, 1, 0.0205, lambda s: (chest_out(s)[1] - 0.08, chest_out(s)[1] - 0.01),
                        trim, thickness=0.004, smooth=0), vest)
    mtx = surface_matrix(torso, Vector((0, cy, spine2.z + 0.03)), FRONT, 0.0185)
    for o in church_emblem(f"{name}_emblem", mtx, 0.05, trim):
        follow(o, vest)
    # --- abdômen: três lâminas sobrepostas (a de cima por fora), acompanham a barriga
    top = z0 + 0.012
    for k in range(3):
        h = 0.07
        bot = top - h
        th = 44 - 3 * k
        follow(surface_patch(f"{name}_plate_abs{k}", torso, tframe(bot, top, -th, th), 9, 2, 0.0155 - 0.0025 * k,
                             rounded_outline(0.12, 0.35), plate, thickness=0.01, bevel_w=0.0025), body)
        top = bot + 0.013
    # --- costas: placa única com filete índigo embaixo
    zb0, zb1 = spine1.z - 0.02, neck.z - 0.03
    back_out = rounded_outline(0.22, 0.25, dip=0.12, dip_w=0.4)
    follow(surface_patch(f"{name}_plate_back", torso, tframe(zb0, zb1, 128, 232), 10, 7, 0.017, back_out, plate, thickness=0.012, bevel_w=0.003), vest)
    follow(surface_patch(f"{name}_trim_back", torso, tframe(zb0, zb1, 128, 232), 12, 1, 0.0205, lambda s: (back_out(s)[0] + 0.01, back_out(s)[0] + 0.08),
                        indigo, thickness=0.004, smooth=0), vest)
    # --- ombreiras (2 lâminas), antebraços, joelheiras e caneleiras
    for side in ("Left", "Right"):
        sh, el, wr = J(f"{side}Arm"), J(f"{side}ForeArm"), J(f"{side}Hand")
        ua = (el - sh).normalized()
        lat = UP - ua * UP.dot(ua)
        p = surface_patch(f"{name}_pauldron_{side[0]}0", sleeve, cyl_frame(sh - ua * 0.015, sh + ua * 0.125, lat, -68, 68), 9, 4, 0.03,
                          rounded_outline(0.3, 0.35), plate, thickness=0.011, bevel_w=0.0025)
        follow(p, shirt)
        follow(surface_patch(f"{name}_pauldron_{side[0]}1", sleeve, cyl_frame(sh + ua * 0.085, sh + ua * 0.185, lat, -64, 64), 8, 2, 0.024,
                            rounded_outline(0.2, 0.35), plate, thickness=0.01, bevel_w=0.0025), shirt)
        follow(surface_patch(f"{name}_pauldron_trim_{side[0]}", sleeve, cyl_frame(sh + ua * 0.085, sh + ua * 0.185, lat, -64, 64), 8, 1, 0.0275,
                            lambda s: (0.06, 0.2), indigo, thickness=0.003, smooth=0), shirt)
        fa = (wr - el).normalized()
        dorsal = UP - fa * UP.dot(fa)
        follow(surface_patch(f"{name}_vambrace_{side[0]}", sleeve, cyl_frame(el + fa * 0.06, el + fa * 0.22, dorsal, -72, 72), 8, 4, 0.02,
                            rounded_outline(0.2, 0.25), plate, thickness=0.008, bevel_w=0.002), shirt)
        knee, ankle = J(f"{side}Leg"), J(f"{side}Foot")
        sd = (ankle - knee).normalized()
        fwd = FRONT - sd * FRONT.dot(sd)
        follow(surface_patch(f"{name}_kneepad_{side[0]}", legs, cyl_frame(knee - sd * 0.075, knee + sd * 0.065, fwd, -62, 62), 8, 5, 0.026,
                            rounded_outline(0.3, 0.35), plate, thickness=0.012, bevel_w=0.003), pants)
        follow(surface_patch(f"{name}_shin_{side[0]}", legs, cyl_frame(knee + sd * 0.085, ankle - sd * 0.075, fwd, -56, 56), 8, 8, 0.021,
                            rounded_outline(0.25, 0.1), plate, thickness=0.01, bevel_w=0.0025), pants)
        follow(surface_patch(f"{name}_kneepad_trim_{side[0]}", legs, cyl_frame(knee - sd * 0.075, knee + sd * 0.065, fwd, -62, 62), 8, 1, 0.0285,
                            lambda s: (0.38, 0.5), trim, thickness=0.003, smooth=0), pants)
    # --- cinto de serviço com fivela, bolsos, cassetete
    zb = hips.z + 0.015
    if vest is not None:
        cut_garment(vest, hem_z=zb + 0.006)  # barra do colete reta, escondida sob o cinto
    hip_layer = LayerSurface([pants, vest], outer=True)
    belt = ring_band(f"{name}_dutybelt", hip_layer, Vector((0, cy, zb - 0.024)), Vector((0, cy, zb + 0.024)), 40, [0.0, 1.0], 0.004, belt_mat,
                     thickness=0.012, uniform=True)
    follow(belt, pants)
    bl = LayerSurface([belt])
    mtx = surface_matrix(bl, Vector((0, cy, zb)), FRONT, 0.002)
    follow(part("cube", f"{name}_dutybelt_buckle", mtx, (0.06, 0.04, 0.008), trim, bevel_w=0.003), pants)
    for k, thc in enumerate((38, -38, 160, -160)):
        mtx = surface_matrix(bl, Vector((0, cy, zb - 0.01)), at(thc), 0.0)
        follow(part("cube", f"{name}_pouch_{k}", mtx @ T(0, 0, 0.021), (0.075, 0.085, 0.042), pouch, bevel_w=0.008), pants)
        follow(part("cube", f"{name}_pouch_flap_{k}", mtx @ T(0, 0.028, 0.043), (0.079, 0.035, 0.006), pouch, bevel_w=0.003), pants)
    mtx = surface_matrix(bl, Vector((0, cy, zb - 0.16)), at(138), 0.03)
    rigid(part("cylinder", f"{name}_baton", mtx @ Matrix.Rotation(math.pi / 2, 4, "X"), (0.032, 0.032, 0.40), belt_mat, vertices=10), "mixamorig:Hips")
    # --- colete: rádio (esquerda) e lanterna (direita) nas laterais do peito
    mtx = surface_matrix(torso, Vector((0, cy, spine2.z - 0.01)), at(66), 0.0)
    follow(part("cube", f"{name}_radio", mtx @ T(0, 0, 0.018), (0.058, 0.105, 0.034), pouch, bevel_w=0.006), vest)
    follow(part("cylinder", f"{name}_radio_antenna", mtx @ T(0.016, 0.085, 0.022) @ Matrix.Rotation(math.pi / 2, 4, "X"), (0.008, 0.008, 0.07), belt_mat, vertices=6), vest)
    mtx = surface_matrix(torso, Vector((0, cy, spine2.z - 0.01)), at(-66), 0.0)
    follow(part("cylinder", f"{name}_lantern", mtx @ T(0, 0, 0.024) @ Matrix.Rotation(math.pi / 2, 4, "X"), (0.042, 0.042, 0.12), metal, vertices=12), vest)
    follow(part("cylinder", f"{name}_lantern_lens", mtx @ T(0, 0.061, 0.024) @ Matrix.Rotation(math.pi / 2, 4, "X"), (0.036, 0.036, 0.004), lens, vertices=12), vest)
    # --- gola de proteção (tecido reforçado índigo) cobrindo a transição colete/pescoço
    ndir = (head - neck).normalized()
    follow(ring_band(f"{name}_neck_guard", surf, neck - ndir * 0.045, neck + ndir * 0.03, 28, [0.0, 0.5, 1.0], [0.034, 0.026, 0.02],
                     indigo, thickness=0.008, max_r=0.08), body)
    # --- capacete de polímero: casco até a nuca, viseira levantada sobre a testa, pivôs índigo
    eye_l = sum((verts[i] for i in group_indices(vgroups, "joint-l-eye")), Vector()) / 8
    eye_r = sum((verts[i] for i in group_indices(vgroups, "joint-r-eye")), Vector()) / 8
    eye = (eye_l + eye_r) / 2
    c = Vector((0.0, (eye.y + head.y) / 2 + 0.02, eye.z + 0.015))
    el0, el1 = -40.0, 80.0

    def e_min(az_deg: float) -> float:
        az = math.radians(az_deg)
        return -5.5 + 27.0 * math.cos(az) + 4.5 * math.cos(2 * az)

    shell_out = lambda s: ((e_min(-180 + 360 * s) - el0) / (el1 - el0), 1.0)  # noqa: E731
    rigid(surface_patch(f"{name}_helmet", surf, sph_frame(c, FRONT, UP, -180, 180, el0, el1), 28, 7, 0.031, shell_out, helmet_mat,
                        thickness=0.011, bevel_w=0.003, closed=True, pole=(c, UP)), "mixamorig:Head")
    rigid(surface_patch(f"{name}_helmet_rim", surf, sph_frame(c, FRONT, UP, -180, 180, el0, el1), 28, 1, 0.034,
                        lambda s: (shell_out(s)[0] + 0.005, shell_out(s)[0] + 0.06), indigo, thickness=0.004, closed=True, smooth=0), "mixamorig:Head")
    ef = e_min(0)
    rigid(surface_patch(f"{name}_visor", surf, sph_frame(c, FRONT, UP, -72, 72, ef + 5, ef + 36), 12, 4, 0.045,
                        rounded_outline(0.12, 0.3), visor, thickness=0.005, bevel_w=0.002), "mixamorig:Head")
    for sgn in (1, -1):
        az = math.radians(76 * sgn)
        el = math.radians(ef + 14)
        d = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
        mtx = surface_matrix(surf, c, d, 0.043)
        rigid(part("cylinder", f"{name}_visor_pivot_{'l' if sgn > 0 else 'r'}", mtx, (0.03, 0.03, 0.01), indigo, vertices=12), "mixamorig:Head")
        rigid(part("cylinder", f"{name}_visor_pivot_cap_{'l' if sgn > 0 else 'r'}", mtx @ T(0, 0, 0.0055), (0.012, 0.012, 0.004), trim, vertices=8), "mixamorig:Head")
    return out


# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="", help="lista de nomes separados por vírgula")
    ap.add_argument("--no-bake", action="store_true")
    ap.add_argument("--tex", type=int, default=2048)
    ap.add_argument("--out", default=os.path.join(REPO, "public", "assets", "characters"))
    ap.add_argument("--anim-lib", default=ANIM_LIBRARY_DEFAULT, help="GLB da Quaternius Universal Animation Library (in-place)")
    ap.add_argument("--procedural-anims", action="store_true", help="ignora a biblioteca e usa os clipes procedurais provisórios")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    names = [n.strip() for n in args.only.split(",") if n.strip()] or list(CHARACTERS)
    anim_lib = None if args.procedural_anims else args.anim_lib
    if anim_lib and not os.path.exists(anim_lib):
        log(f"AVISO: biblioteca de animações não encontrada em {anim_lib} — clipes procedurais provisórios serão usados")
        anim_lib = None
    base = BaseMesh(os.path.join(DATA, "base.obj"))
    vgroups = load_vertex_groups()
    weights = load_weights()
    manifest = {
        "generator": "tools/blender/make_character.py",
        "source": "MakeHuman hm08 (CC0) + Blender headless",
        "animations": "Quaternius Universal Animation Library v3 Standard (CC0), retarget tools/blender/retarget.py" if anim_lib else "procedural (provisório)",
        "fps": FPS,
        "rig": "mixamo",
        "bones": list(B.values()),
        "clips": {},
        "characters": {},
    }
    manifest_path = os.path.join(args.out, "characters.json")
    if args.only and os.path.exists(manifest_path):
        # --only: atualiza só as variantes geradas, preservando as demais entradas do manifesto
        with open(manifest_path, "r", encoding="utf-8") as f:
            old = json.load(f)
        manifest["characters"] = old.get("characters", {})
        manifest["clips"] = old.get("clips", {})
    for n in names:
        spec = CHARACTERS[n]
        tex = args.tex if n == "matias" else min(args.tex, 1024)
        manifest["characters"][n], manifest["clips"] = build_character(n, spec, base, vgroups, weights, tex, not args.no_bake, args.out, anim_lib)
    manifest["characters"] = {k: manifest["characters"][k] for k in CHARACTERS if k in manifest["characters"]}
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)
    log("concluído")


if __name__ == "__main__":
    main()
