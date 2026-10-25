#!/usr/bin/env python3.11
"""
Gerador de personagens realistas para O Último Veto — EVA.

Executa no Blender headless (módulo `bpy` do PyPI) e usa apenas DADOS CC0 do MakeHuman
(malha base hm08, targets de morfologia, rig compatível com Mixamo + pesos, máscaras e olhos),
vendorizados em tools/blender/data/makehuman. Nenhum código do MakeHuman/MPFB é executado:
toda a lógica (parsing, morphing, rig, pele, roupas, acessórios, animação, export) é deste arquivo.

Saída: public/assets/characters/<nome>.glb — malha com pele bakeada, roupas, cabelo, olhos,
armature Mixamo (52 ossos) e clipes de animação esquelética (Idle, Walk, Run, CrouchIdle,
CrouchWalk, Talk, Interact) em trilhas NLA.

Uso:
  python3.11 tools/blender/make_character.py [--only matias,ana] [--no-bake] [--tex 2048] [--out DIR]
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
        "skin": "#6a4832", "hair": "#111111", "hair_style": "cap", "beard": 0.3, "eyebrows": 0.9, "gray_hair": 0.0,
        "glasses": False, "vest": "#232a26", "cap": "#1f2622",
        "shirt": "#3a4a40", "sleeves": "long", "pants": "#2b2f2b", "boots": "#1c1c1c",
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

    cloth_objs = []
    spec_mats = {
        "shirt": simple_material(f"{name}_mat_shirt", spec["shirt"], 0.88),
        "pants": simple_material(f"{name}_mat_pants", spec["pants"], 0.9),
        "boots": simple_material(f"{name}_mat_boots", spec["boots"], 0.6),
    }
    offsets = {"shirt": 0.013, "pants": 0.010, "boots": 0.014}
    hidden_faces = set()
    for r, faces in faces_by_region.items():
        if not faces:
            continue
        obj = extract_faces(body, faces, f"{name}_{r}", offsets[r])
        if r == "boots":
            smooth_mesh(obj, iterations=14, factor=0.6)
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
    measures = body_measures(body, region, joints)
    # cabelo: duplicado do couro cabeludo do próprio corpo (antes de remover faces cobertas)
    hair_objs = build_hair(name, spec, body, joints, vgroups, verts, scale)
    for h in hair_objs:
        if not h.vertex_groups:
            assign_single_bone(h, "mixamorig:Head")
        parent_to_armature(h, arm)

    # --- acessórios (alças usam faces do corpo: antes da remoção) -------------
    acc = build_accessories(name, spec, verts, vgroups, joints, scale, measures)
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
    tris = sum(len(p.vertices) - 2 for o in objs if o.type == "MESH" for p in o.data.polygons)
    log(f"{name}: exportado {out} ({os.path.getsize(out) / 1024:.0f} KB, ~{tris} triângulos antes do solidify) em {time.time() - t0:.1f}s")
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
    sole_mat = simple_material(f"{name}_mat_sole", "#1a1816", 0.9)
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
    for n in names:
        spec = CHARACTERS[n]
        tex = args.tex if n == "matias" else min(args.tex, 1024)
        manifest["characters"][n], manifest["clips"] = build_character(n, spec, base, vgroups, weights, tex, not args.no_bake, args.out, anim_lib)
    if not args.only:
        with open(os.path.join(args.out, "characters.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, indent=2, ensure_ascii=False)
    log("concluído")


if __name__ == "__main__":
    main()
