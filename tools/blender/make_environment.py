#!/usr/bin/env python3.11
"""Gera os módulos de cenário do "hero corner" da praça (M1.1) em Blender headless:
fachada da Central de Suprimentos com profundidade real, posto de distribuição, banca de feira,
props (botijão, gerador, barril, banco, caixa elétrica) e colisores simples — um único GLB com
materiais PBR de texturas CC0 (ambientCG) embutidas.

Uso: python3.11 tools/blender/make_environment.py [--out public/assets/environments/praca_hero.glb] [--preview pasta]
Convenções: metros; cada asset é um nó raiz nomeado, modelado na própria origem, frente para -Y
(= +Z no glTF/Babylon, como os personagens). Colisores: malhas "COL_*" (caixas) dentro do asset.
"""
from __future__ import annotations

import argparse
import math
import os
import sys
import time

import bpy  # noqa: E402 — precisa vir antes de bmesh
import bmesh
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
TEX = os.path.join(REPO, "public", "assets", "textures")
GEN = os.path.join(HERE, ".cache", "env")
os.makedirs(GEN, exist_ok=True)


def log(*a):
    print("[make_environment]", *a, flush=True)


# ---------------------------------------------------------------------------
# Materiais
# ---------------------------------------------------------------------------
_images: dict[str, bpy.types.Image] = {}


def image(path: str, srgb: bool) -> bpy.types.Image:
    if path in _images:
        return _images[path]
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = "sRGB" if srgb else "Non-Color"
    _images[path] = img
    return img


def gltf_settings_group():
    """Grupo de nós que o exportador glTF reconhece para oclusão (AO)."""
    name = "glTF Material Output"
    g = bpy.data.node_groups.get(name)
    if g is None:
        g = bpy.data.node_groups.new(name, "ShaderNodeTree")
        g.interface.new_socket("Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
        g.nodes.new("NodeGroupInput")
    return g


_mats: dict[str, bpy.types.Material] = {}


def pbr(name: str, tex: str | None = None, tint=(1.0, 1.0, 1.0), tile: float = 2.0, rough: float = 1.0, metallic: float | None = None, emissive=None, emissive_strength: float = 1.0, color=(0.8, 0.8, 0.8), roughness: float = 0.6, alpha_blend: bool = False, normal_strength: float = 1.0) -> bpy.types.Material:
    """Material PBR: com `tex` usa as texturas de public/assets/textures/<tex>/ (tingidas por `tint`);
    sem textura usa cor sólida. `tile` (m por repetição) é guardado em custom property para o mapeamento UV."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m["tile"] = tile
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    out = nt.nodes["Material Output"]
    if tex:
        d = os.path.join(TEX, tex)
        col = nt.nodes.new("ShaderNodeTexImage")
        col.image = image(os.path.join(d, "Color.jpg"), True)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        mix.blend_type = "MULTIPLY"
        mix.inputs["Factor"].default_value = 1.0
        nt.links.new(col.outputs["Color"], mix.inputs["A"])
        mix.inputs["B"].default_value = (*tint, 1.0)
        nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
        nrm = nt.nodes.new("ShaderNodeTexImage")
        nrm.image = image(os.path.join(d, "NormalGL.jpg"), False)
        nmap = nt.nodes.new("ShaderNodeNormalMap")
        nmap.inputs["Strength"].default_value = normal_strength
        nt.links.new(nrm.outputs["Color"], nmap.inputs["Color"])
        nt.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
        rgh = nt.nodes.new("ShaderNodeTexImage")
        rgh.image = image(os.path.join(d, "Roughness.jpg"), False)
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = rough
        nt.links.new(rgh.outputs["Color"], mul.inputs[0])
        nt.links.new(mul.outputs["Value"], bsdf.inputs["Roughness"])
        met_path = os.path.join(d, "Metalness.jpg")
        if metallic is None and os.path.exists(met_path):
            met = nt.nodes.new("ShaderNodeTexImage")
            met.image = image(met_path, False)
            nt.links.new(met.outputs["Color"], bsdf.inputs["Metallic"])
        else:
            bsdf.inputs["Metallic"].default_value = metallic or 0.0
        ao_path = os.path.join(d, "AmbientOcclusion.jpg")
        if os.path.exists(ao_path):
            ao = nt.nodes.new("ShaderNodeTexImage")
            ao.image = image(ao_path, False)
            grp = nt.nodes.new("ShaderNodeGroup")
            grp.node_tree = gltf_settings_group()
            nt.links.new(ao.outputs["Color"], grp.inputs["Occlusion"])
    else:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic or 0.0
    if emissive:
        bsdf.inputs["Emission Color"].default_value = (*emissive, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emissive_strength
    if alpha_blend:
        m.blend_method = "BLEND"
        m.surface_render_method = "BLENDED"
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    _mats[name] = m
    return m


def generated_texture(name: str, size: int, fn) -> str:
    """Textura procedural pequena (PIL) salva em cache — listras, madeira, manchas."""
    from PIL import Image

    path = os.path.join(GEN, f"{name}.png")
    if not os.path.exists(path):
        img = Image.new("RGBA", (size, size))
        px = img.load()
        for y in range(size):
            for x in range(size):
                px[x, y] = fn(x / size, y / size)
        img.save(path)
    return path


def drawn_texture(name: str, size: int, fn) -> str:
    """Textura procedural desenhada com PIL.ImageDraw (folhagem, casca) salva em cache."""
    from PIL import Image, ImageDraw

    path = os.path.join(GEN, f"{name}.png")
    if not os.path.exists(path):
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        fn(img, ImageDraw.Draw(img), size)
        img.save(path)
    return path


def textured_plain(name: str, png: str, tile: float, roughness=0.8, alpha_blend=False, tint=(1, 1, 1), alpha_clip=False, double_sided=False) -> bpy.types.Material:
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m["tile"] = tile
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = image(png, True)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    nt.links.new(t.outputs["Color"], mix.inputs["A"])
    mix.inputs["B"].default_value = (*tint, 1.0)
    nt.links.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = roughness
    if alpha_blend:
        nt.links.new(t.outputs["Alpha"], bsdf.inputs["Alpha"])
        m.blend_method = "BLEND"
        m.surface_render_method = "BLENDED"
    if alpha_clip:
        # Blender 4.2+: o exportador glTF reconhece "alpha clip" por um nó Math ROUND no Alpha → alphaMode MASK (cutoff 0,5)
        rnd_node = nt.nodes.new("ShaderNodeMath")
        rnd_node.operation = "ROUND"
        nt.links.new(t.outputs["Alpha"], rnd_node.inputs[0])
        nt.links.new(rnd_node.outputs[0], bsdf.inputs["Alpha"])
        m.surface_render_method = "DITHERED"
    if double_sided:
        m.use_backface_culling = False
    else:
        m.use_backface_culling = True
    _mats[name] = m
    return m


def _noise(x: float, y: float, seed: int = 0) -> float:
    v = math.sin(x * 12.9898 + y * 78.233 + seed * 3.7) * 43758.5453
    return v - math.floor(v)


def materials():
    import random

    rnd = random.Random(7)

    def wood(x, y):
        grain = 0.5 + 0.5 * math.sin((y * 40 + math.sin(x * 9) * 1.5) * 1.0)
        n = _noise(math.floor(x * 256), math.floor(y * 256))
        base = 0.42 + 0.18 * grain + 0.08 * n
        return (int(255 * min(1, base * 1.05)), int(255 * min(1, base * 0.72)), int(255 * min(1, base * 0.45)), 255)

    def stripes(x, y):
        s = int(x * 8) % 2
        fade = 0.75 + 0.25 * _noise(math.floor(x * 64), math.floor(y * 64))
        c = (205, 60, 45) if s == 0 else (236, 228, 205)
        return (int(c[0] * fade), int(c[1] * fade), int(c[2] * fade), 255)

    def stain(x, y):
        # escorrido vertical escuro, mais denso em cima, com bordas irregulares
        streak = 0.0
        for k in range(6):
            cx = 0.1 + 0.8 * _noise(k, 1)
            w = 0.03 + 0.05 * _noise(k, 2)
            streak = max(streak, math.exp(-((x - cx) ** 2) / (2 * w * w)) * (1 - y) ** (0.8 + k * 0.2))
        a = min(1, streak * 0.85 + 0.15 * _noise(math.floor(x * 128), math.floor(y * 128)) * (1 - y))
        return (40, 36, 30, int(255 * a * 0.75))

    def bark(x, y):
        ridge = 0.5 + 0.5 * math.sin(x * 80 + math.sin(y * 30) * 2.0 + _noise(math.floor(x * 32), math.floor(y * 8)) * 3)
        n = _noise(math.floor(x * 256), math.floor(y * 256))
        base = 0.28 + 0.22 * ridge + 0.1 * n
        return (int(255 * min(1, base * 0.95)), int(255 * min(1, base * 0.78)), int(255 * min(1, base * 0.58)), 255)

    def leaves(img, draw, size):
        # ~90 folhas elípticas sobrepostas (verdes variados), densas no centro, com miolo mais escuro
        lr = random.Random(11)
        for i in range(90):
            r = 0.46 * math.sqrt(lr.random())
            a = lr.random() * math.tau
            cx, cy = size * (0.5 + r * math.cos(a)), size * (0.5 + r * math.sin(a))
            la, lb = size * (0.055 + 0.035 * lr.random()), size * (0.022 + 0.014 * lr.random())
            rot = lr.random() * math.tau
            shade = 0.55 + 0.45 * lr.random()
            edge = 1.0 - 0.35 * (r / 0.46)
            col = (int(70 * shade * edge), int((110 + 60 * lr.random()) * shade), int(45 * shade * edge), 255)
            pts = []
            for k in range(14):
                t = k / 14 * math.tau
                px, py = la * math.cos(t), lb * math.sin(t)
                pts.append((cx + px * math.cos(rot) - py * math.sin(rot), cy + px * math.sin(rot) + py * math.cos(rot)))
            draw.polygon(pts, fill=col)
            # nervura central
            vx, vy = la * math.cos(rot), la * math.sin(rot)
            draw.line([(cx - vx * 0.9, cy - vy * 0.9), (cx + vx * 0.9, cy + vy * 0.9)], fill=(int(col[0] * 0.7), int(col[1] * 0.7), int(col[2] * 0.7), 255), width=max(1, size // 256))

    return {
        "bark": textured_plain("bark", generated_texture("bark", 256, bark), tile=0.9, roughness=0.95),
        "leaves": textured_plain("leaves", drawn_texture("leaves", 512, leaves), tile=1.0, roughness=0.85, alpha_clip=True, double_sided=True),
        "plaster_warm": pbr("plaster_warm", "PaintedPlaster017", tint=(0.86, 0.80, 0.70), tile=1.6, rough=1.0),
        "plaster_gray": pbr("plaster_gray", "PaintedPlaster017", tint=(0.72, 0.72, 0.70), tile=1.6, rough=1.0),
        "plaster_sand": pbr("plaster_sand", "PaintedPlaster017", tint=(0.84, 0.76, 0.58), tile=1.6, rough=1.0),
        "concrete": pbr("concrete", "Concrete034", tint=(0.9, 0.9, 0.88), tile=2.0, rough=1.0),
        "concrete_dark": pbr("concrete_dark", "Concrete034", tint=(0.6, 0.6, 0.6), tile=1.2, rough=1.0),
        "rust": pbr("rust", "Rust004", tint=(1, 1, 1), tile=1.0, rough=1.0),
        "rust_dark": pbr("rust_dark", "Rust004", tint=(0.55, 0.52, 0.5), tile=0.7, rough=1.0),
        "corrugated": pbr("corrugated", "CorrugatedSteel005", tint=(0.9, 0.88, 0.85), tile=1.0, rough=1.0),
        "paving": pbr("paving", "PavingStones070", tint=(0.92, 0.9, 0.86), tile=2.0, rough=1.0),
        "metal_green": pbr("metal_green", color=(0.22, 0.28, 0.24), roughness=0.55, metallic=0.6),
        "metal_dark": pbr("metal_dark", color=(0.12, 0.12, 0.13), roughness=0.5, metallic=0.7),
        "metal_light": pbr("metal_light", color=(0.55, 0.57, 0.58), roughness=0.45, metallic=0.8),
        "gold": pbr("gold", color=(0.85, 0.66, 0.28), roughness=0.3, metallic=1.0),
        "glass_dark": pbr("glass_dark", color=(0.06, 0.08, 0.1), roughness=0.12, metallic=0.0),
        "glass_lit": pbr("glass_lit", color=(0.55, 0.42, 0.25), roughness=0.3, emissive=(1.0, 0.68, 0.3), emissive_strength=1.1),
        "screen": pbr("screen", color=(0.1, 0.3, 0.15), roughness=0.4, emissive=(0.35, 1.0, 0.45), emissive_strength=2.0),
        "lamp": pbr("lamp", color=(1, 0.95, 0.85), roughness=0.5, emissive=(1.0, 0.9, 0.7), emissive_strength=4.0),
        "fabric_olive": pbr("fabric_olive", color=(0.32, 0.34, 0.22), roughness=0.95),
        "fabric_cream": pbr("fabric_cream", color=(0.85, 0.80, 0.66), roughness=0.95),
        "plastic_blue": pbr("plastic_blue", color=(0.1, 0.25, 0.55), roughness=0.5),
        "rubber": pbr("rubber", color=(0.05, 0.05, 0.05), roughness=0.9),
        "wood": textured_plain("wood", generated_texture("wood", 256, wood), tile=1.2, roughness=0.75),
        "stripes": textured_plain("stripes", generated_texture("stripes", 256, stripes), tile=1.5, roughness=0.9),
        "stain": textured_plain("stain", generated_texture("stain", 256, stain), tile=1.0, roughness=0.9, alpha_blend=True),
        "paper": pbr("paper", color=(0.9, 0.87, 0.78), roughness=0.9),
        "produce_green": pbr("produce_green", color=(0.35, 0.5, 0.2), roughness=0.7),
        "produce_orange": pbr("produce_orange", color=(0.85, 0.45, 0.12), roughness=0.6),
        "produce_brown": pbr("produce_brown", color=(0.45, 0.3, 0.18), roughness=0.85),
    }


# ---------------------------------------------------------------------------
# Geometria
# ---------------------------------------------------------------------------
_parts: list[bpy.types.Object] = []


def _link(obj):
    bpy.context.scene.collection.objects.link(obj)
    _parts.append(obj)
    return obj


def box(name: str, size, loc, mat, rot=(0, 0, 0), bevel: float = 0.0, segments: int = 2) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    _link(obj)
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    return obj


def cylinder(name: str, radius: float, height: float, loc, mat, segments: int = 24, rot=(0, 0, 0), bevel: float = 0.0, cap=True) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, segments=segments, radius1=radius, radius2=radius, depth=height)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    _link(obj)
    if bevel > 0 and cap:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        mod.limit_method = "ANGLE"
        mod.angle_limit = math.radians(40)
    return obj


def torus(name: str, major: float, minor: float, loc, mat, rot=(0, 0, 0), seg_major=32, seg_minor=10) -> bpy.types.Object:
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=seg_major, minor_segments=seg_minor, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.materials.append(mat)
    _parts.append(obj)
    return obj


def sphere(name: str, radius: float, loc, mat, subdiv: int = 2) -> bpy.types.Object:
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=radius)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return _link(obj)


def wavy_plane(name: str, w: float, h: float, loc, mat, rot=(0, 0, 0), nx=48, ny=12, amp=0.03, freq=6.0, sag=0.0, corrugate: float = 0.0, corr_period: float = 0.076) -> bpy.types.Object:
    """Plano subdividido com ondulação (lona/tecido) ou corrugação (telha)."""
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=nx, y_segments=ny, size=0.5)
    bmesh.ops.scale(bm, vec=Vector((w, h, 1)), verts=bm.verts)
    for v in bm.verts:
        u = v.co.x / w + 0.5
        t = v.co.y / h + 0.5
        z = 0.0
        if amp:
            z += amp * math.sin(u * freq * math.pi) * math.sin(t * math.pi) + amp * 0.4 * math.sin(t * freq * 0.7 * math.pi + u * 3)
        if sag:
            z -= sag * math.sin(u * math.pi) * math.sin(t * math.pi)
        if corrugate:
            z += corrugate * math.sin(v.co.x / corr_period * 2 * math.pi)
        v.co.z += z
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = Vector(loc)
    obj.rotation_euler = rot
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    return _link(obj)


def cut(target: bpy.types.Object, cutters: list[bpy.types.Object]):
    """Subtrai os cutters do alvo (boolean exato) e os remove."""
    for c in cutters:
        mod = target.modifiers.new("cut", "BOOLEAN")
        mod.operation = "DIFFERENCE"
        mod.solver = "EXACT"
        mod.object = c
    apply_modifiers(target)
    for c in cutters:
        if c in _parts:
            _parts.remove(c)
        bpy.data.objects.remove(c, do_unlink=True)


def apply_modifiers(obj: bpy.types.Object):
    with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
        for m in list(obj.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)


def box_uv(obj: bpy.types.Object, tile: float | None = None):
    """UV por projeção em caixa (mundo) na escala do material (`tile` m por repetição)."""
    if tile is None:
        tile = float(obj.data.materials[0].get("tile", 1.0)) if obj.data.materials else 1.0
    mw = obj.matrix_world
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = (mw.to_3x3() @ f.normal)
        ax, ay, az = abs(n.x), abs(n.y), abs(n.z)
        for loop in f.loops:
            p = mw @ loop.vert.co
            if az >= ax and az >= ay:
                u, v = p.x, p.y
            elif ax >= ay:
                u, v = p.y, p.z
            else:
                u, v = p.x, p.z
            loop[uv].uv = (u / tile, v / tile)
    bm.to_mesh(obj.data)
    bm.free()


def smooth_by_angle(obj: bpy.types.Object, deg: float = 32.0):
    """Faces suaves com arestas marcadas como vivas acima do ângulo (o exportador glTF divide as normais nelas)."""
    limit = math.radians(deg)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()
    for f in bm.faces:
        f.smooth = True
    for e in bm.edges:
        faces = e.link_faces
        if len(faces) == 2:
            e.smooth = faces[0].normal.angle(faces[1].normal, 0.0) < limit
        else:
            e.smooth = True
    bm.to_mesh(obj.data)
    bm.free()


def finish(objs: list[bpy.types.Object], root_name: str, smooth=True) -> bpy.types.Object:
    """Aplica modificadores, UVs e suavização; junta por material; agrupa sob um Empty raiz."""
    root = bpy.data.objects.new(root_name, None)
    bpy.context.scene.collection.objects.link(root)
    by_mat: dict[str, list[bpy.types.Object]] = {}
    for o in objs:
        apply_modifiers(o)
        if not o.name.startswith("COL_"):
            box_uv(o)
            if smooth:
                smooth_by_angle(o)
        key = o.data.materials[0].name if o.data.materials else "none"
        if o.name.startswith("COL_"):
            key = "COL:" + o.name
        by_mat.setdefault(key, []).append(o)
    out = []
    for key, group in by_mat.items():
        if len(group) > 1 and not key.startswith("COL:"):
            with bpy.context.temp_override(object=group[0], active_object=group[0], selected_objects=group, selected_editable_objects=group):
                bpy.ops.object.join()
            obj = group[0]
            obj.name = f"{root_name}_{key}"
        else:
            obj = group[0]
            if not key.startswith("COL:"):
                obj.name = f"{root_name}_{key}"
        obj.parent = root
        out.append(obj)
    return root


def collider(name: str, size, loc, rot=(0, 0, 0)) -> bpy.types.Object:
    m = _mats.get("collider") or pbr("collider", color=(1, 0, 1), roughness=1)
    o = box(f"COL_{name}", size, loc, m, rot)
    return o


# ---------------------------------------------------------------------------
# Assets
# ---------------------------------------------------------------------------
def facade_central(M) -> bpy.types.Object:
    """Fachada da Central de Suprimentos: 16 m de largura, 2 pavimentos (7,6 m), frente para -Y.
    Parede com vãos reais (recuo 30 cm), pilastras, cornija, platibanda, portão de aço segmentado,
    grades, peitoris, calhas, aparelhos de ar, emblema da Igreja e manchas de escorrimento."""
    start = len(_parts)
    W, D, H = 16.0, 0.5, 7.6
    wall = box("parede", (W, D, H), (0, D / 2, H / 2), M["plaster_gray"])
    # vãos: térreo (4 janelas + portão) e andar superior (6 janelas)
    cutters = []
    bays = [-6.7, -4.05, 4.05, 6.7]
    for i, x in enumerate(bays):
        cutters.append(box(f"cut_g{i}", (1.3, 1.5, 1.7), (x, 0.0, 1.1 + 0.85), M["plaster_gray"]))
    for i, x in enumerate([-6.7, -4.05, -1.35, 1.35, 4.05, 6.7]):
        cutters.append(box(f"cut_u{i}", (1.3, 1.5, 1.6), (x, 0.0, 4.75 + 0.8), M["plaster_gray"]))
    cutters.append(box("cut_gate", (4.0, 1.5, 3.4), (0, 0.0, 1.7), M["plaster_gray"]))
    cut(wall, cutters)
    bev = wall.modifiers.new("bevel", "BEVEL")
    bev.width = 0.012
    bev.segments = 2
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(40)
    # retornos laterais (profundidade nos cantos)
    box("retorno_e", (0.5, 2.2, H), (-W / 2 + 0.25, D + 1.1, H / 2), M["plaster_gray"], bevel=0.012)
    box("retorno_d", (0.5, 2.2, H), (W / 2 - 0.25, D + 1.1, H / 2), M["plaster_gray"], bevel=0.012)
    # embasamento, faixa entre pavimentos, cornija e platibanda (concreto)
    box("embasamento", (W + 0.2, 0.64, 0.9), (0, 0.26, 0.45), M["concrete_dark"], bevel=0.02)
    box("faixa", (W + 0.3, 0.68, 0.22), (0, 0.24, 3.72), M["concrete"], bevel=0.02)
    box("cornija_1", (W + 0.4, 0.74, 0.2), (0, 0.22, 7.0), M["concrete"], bevel=0.03)
    box("cornija_2", (W + 0.6, 0.84, 0.16), (0, 0.18, 7.18), M["concrete"], bevel=0.03)
    box("platibanda", (W, 0.5, 0.5), (0, D / 2, 7.85), M["plaster_gray"], bevel=0.012)
    box("platibanda_topo", (W + 0.2, 0.62, 0.08), (0, D / 2, 8.12), M["concrete"], bevel=0.015)
    # pilastras
    for x in (-8.0, -5.4, -2.7, 2.7, 5.4, 8.0):
        box(f"pilastra_{x}", (0.5, 0.3, 7.1), (x, -0.1, 3.55), M["plaster_warm"], bevel=0.02)
        box(f"pilastra_base_{x}", (0.6, 0.38, 0.5), (x, -0.12, 0.25), M["concrete_dark"], bevel=0.02)
    # janelas: peitoril, caixilho, vidro recuado, grade (térreo)
    def window(x, z0, h, bars: bool, lit: bool, i):
        box(f"peitoril_{i}", (1.5, 0.42, 0.08), (x, 0.08, z0 - 0.04), M["concrete"], bevel=0.01)
        fr = M["metal_dark"]
        t = 0.06
        for dx, sz in ((-0.65 + t / 2, (t, 0.08, h)), (0.65 - t / 2, (t, 0.08, h))):
            box(f"caixilho_v_{i}_{dx}", sz, (x + dx, 0.33, z0 + h / 2), fr)
        box(f"caixilho_h1_{i}", (1.3, 0.08, t), (x, 0.33, z0 + h - t / 2), fr)
        box(f"caixilho_h2_{i}", (1.3, 0.08, t), (x, 0.33, z0 + h / 2), fr)
        box(f"vidro_{i}", (1.22, 0.02, h - 0.1), (x, 0.36, z0 + h / 2), M["glass_lit"] if lit else M["glass_dark"])
        if bars:
            for k in range(4):
                cylinder(f"grade_{i}_{k}", 0.012, h - 0.05, (x - 0.45 + k * 0.3, 0.2, z0 + h / 2), M["metal_dark"], segments=8)
            box(f"grade_h_{i}", (1.25, 0.024, 0.024), (x, 0.2, z0 + h * 0.5), M["metal_dark"])
        # escorrido sob o peitoril
        wavy_plane(f"mancha_{i}", 1.3, 0.9, (x, -0.004, z0 - 0.53), M["stain"], rot=(math.pi / 2, 0, 0), nx=2, ny=2, amp=0)

    for i, x in enumerate(bays):
        window(x, 1.1, 1.7, True, i == 1, f"g{i}")
    for i, x in enumerate([-6.7, -4.05, -1.35, 1.35, 4.05, 6.7]):
        window(x, 4.75, 1.6, False, i in (0, 3, 5), f"u{i}")
    # portão de aço segmentado, recuado, com batente e porta de serviço
    box("batente_e", (0.18, 0.5, 3.4), (-2.0, 0.3, 1.7), M["concrete_dark"], bevel=0.02)
    box("batente_d", (0.18, 0.5, 3.4), (2.0, 0.3, 1.7), M["concrete_dark"], bevel=0.02)
    box("verga", (4.2, 0.5, 0.2), (0, 0.3, 3.3), M["concrete_dark"], bevel=0.02)
    gate_mat = M["rust_dark"]
    box("portao_folha", (3.8, 0.06, 3.15), (0, 0.42, 1.6), gate_mat, bevel=0.01)
    for k in range(7):
        box(f"portao_nervura_{k}", (3.8, 0.05, 0.08), (0, 0.37, 0.25 + k * 0.45), M["metal_dark"], bevel=0.008)
    box("portao_porta", (0.9, 0.04, 2.1), (1.2, 0.38, 1.1), M["metal_dark"], bevel=0.008)
    cylinder("portao_macaneta", 0.02, 0.12, (0.85, 0.33, 1.05), M["metal_light"], segments=10, rot=(math.pi / 2, 0, 0))
    box("placa_custodia", (1.2, 0.03, 0.3), (0, 0.33, 2.9), M["gold"], bevel=0.005)
    # lâmpada sobre o portão
    box("luminaria", (0.5, 0.3, 0.12), (0, 0.15, 3.55), M["metal_dark"], bevel=0.01)
    box("luminaria_luz", (0.4, 0.22, 0.03), (0, 0.15, 3.48), M["lamp"])
    # emblema da Igreja: anel com eixo vertical e semente (iconografia própria)
    torus("emblema_anel", 0.5, 0.05, (0, 0.44, 5.6), M["gold"], rot=(math.pi / 2, 0, 0))
    box("emblema_eixo", (0.07, 0.05, 1.3), (0, 0.44, 5.6), M["gold"], bevel=0.01)
    sphere("emblema_semente", 0.12, (0, 0.44, 5.6), M["gold"])
    # calhas de descida com cotovelos e braçadeiras
    for x in (-7.3, 7.0):
        cylinder(f"calha_{x}", 0.06, 7.0, (x, -0.1, 3.5), M["rust"], segments=16)
        cylinder(f"calha_cotovelo_{x}", 0.06, 0.5, (x, 0.1, 7.1), M["rust"], segments=16, rot=(math.radians(-60), 0, 0))
        for z in (1.0, 3.2, 5.6):
            box(f"bracadeira_{x}_{z}", (0.18, 0.2, 0.06), (x, -0.02, z), M["metal_dark"], bevel=0.008)
    # aparelhos de ar-condicionado sob duas janelas superiores
    for x in (-4.05, 4.05):
        box(f"ac_{x}", (0.78, 0.36, 0.52), (x, -0.2, 4.25), M["metal_light"], bevel=0.015)
        for k in range(6):
            box(f"ac_grelha_{x}_{k}", (0.6, 0.02, 0.03), (x, -0.39, 4.08 + k * 0.07), M["metal_dark"])
        box(f"ac_suporte_{x}", (0.7, 0.4, 0.04), (x, -0.2, 3.98), M["rust_dark"])
    # manchas de infiltração no embasamento e cabos presos à fachada
    for x in (-5.0, 2.5, 6.5):
        wavy_plane(f"mancha_base_{x}", 1.6, 1.0, (x, -0.004, 1.35), M["stain"], rot=(math.pi / 2, 0, 0), nx=2, ny=2, amp=0)
    for z in (6.5, 6.62):
        cylinder(f"cabo_{z}", 0.012, W - 1.0, (0, -0.06, z), M["rubber"], segments=8, rot=(0, math.pi / 2, 0))
    # painéis solares na platibanda (inclinados)
    for x in (-5.5, -2.0, 1.5, 5.0):
        box(f"solar_{x}", (2.6, 1.5, 0.05), (x, 1.6, 8.6), M["glass_dark"], rot=(math.radians(22), 0, 0), bevel=0.01)
        box(f"solar_suporte_{x}", (2.4, 0.08, 0.5), (x, 2.2, 8.35), M["metal_light"])
    # colisor: a parede inteira (as janelas são fundas, mas não se entra)
    collider("fachada", (W + 0.6, 0.9, H + 0.6), (0, 0.3, (H + 0.6) / 2))
    collider("batente_portao", (0.4, 0.6, 3.4), (-2.0, 0.3, 1.7))
    collider("batente_portao_d", (0.4, 0.6, 3.4), (2.0, 0.3, 1.7))
    return finish(_parts[start:], "fachada_central")


def posto_distribuicao(M) -> bpy.types.Object:
    """Posto de distribuição: estrutura tubular soldada, telhado de telha ondulada com lona,
    balcão de blocos de concreto com tampo de tábuas, terminal, papéis, caixa de selos, luminária."""
    start = len(_parts)
    px = (-2.6, 2.6)
    pz = (-1.6, 1.8)
    for x in px:
        for z in pz:
            cylinder(f"pilar_{x}_{z}", 0.07, 3.4, (x, z, 1.7), M["rust"], segments=16)
            box(f"base_{x}_{z}", (0.32, 0.32, 0.03), (x, z, 0.015), M["metal_dark"], bevel=0.005)
            cylinder(f"gusset_{x}_{z}", 0.1, 0.25, (x, z, 3.3), M["rust_dark"], segments=12)
    for z in pz:
        box(f"viga_x_{z}", (5.4, 0.08, 0.08), (0, z, 3.38), M["rust_dark"], bevel=0.008)
    for x in px:
        box(f"viga_z_{x}", (0.08, 3.6, 0.08), (x, 0.1, 3.38), M["rust_dark"], bevel=0.008)
    for x in px:
        cylinder(f"braco_{x}", 0.03, 1.6, (x, pz[0] + 0.55, 2.85), M["rust"], segments=10, rot=(math.radians(50), 0, 0))
        cylinder(f"braco2_{x}", 0.03, 1.6, (x, pz[1] - 0.55, 2.85), M["rust"], segments=10, rot=(math.radians(-50), 0, 0))
    # telhado corrugado inclinado (geometria com ondulação) + lona + beiral
    roof = wavy_plane("telhado", 6.4, 4.4, (0, 0.1, 3.5), M["corrugated"], rot=(-0.08, 0, 0), nx=96, ny=8, amp=0, corrugate=0.012, sag=0.02)
    roof.modifiers.new("solid", "SOLIDIFY").thickness = 0.01
    wavy_plane("lona", 5.8, 3.6, (0, 0.2, 3.58), M["fabric_olive"], rot=(-0.08, 0, 0), nx=32, ny=12, amp=0.035, freq=5)
    box("beiral", (6.5, 0.05, 0.12), (0, -2.1, 3.3), M["rust_dark"], bevel=0.005)
    # balcão: blocos de concreto + tampo de tábuas
    box("balcao_base", (5.0, 0.9, 1.0), (0, 0, 0.5), M["concrete_dark"], bevel=0.02)
    for k in range(3):
        box(f"balcao_junta_{k}", (5.02, 0.92, 0.015), (0, 0, 0.25 + k * 0.25), M["metal_dark"])
    for k in range(5):
        box(f"tampo_{k}", (5.2, 0.19, 0.05), (0, -0.4 + k * 0.2, 1.03), M["wood"], bevel=0.006)
    box("tampo_borda", (5.25, 0.06, 0.08), (0, -0.48, 1.0), M["wood"], bevel=0.006)
    # terminal local, papéis, caixa de selos, sino
    box("terminal", (0.5, 0.36, 0.42), (1.6, 0.0, 1.27), M["metal_dark"], bevel=0.012)
    box("terminal_tela", (0.42, 0.02, 0.3), (1.6, -0.19, 1.31), M["screen"])
    box("terminal_teclado", (0.44, 0.16, 0.025), (1.6, -0.34, 1.07), M["metal_light"], bevel=0.005)
    for k in range(4):
        box(f"papeis_{k}", (0.42 + k * 0.02, 0.3, 0.012), (-0.4 + k * 0.03, 0.05 - k * 0.02, 1.07 + k * 0.012), M["paper"], rot=(0, 0, k * 0.08))
    box("caixa_selos", (0.34, 0.24, 0.2), (-1.6, 0.1, 1.16), M["metal_green"], bevel=0.01)
    box("caixa_selos_tampa", (0.36, 0.26, 0.03), (-1.6, 0.1, 1.275), M["metal_green"], bevel=0.008)
    cylinder("sino", 0.05, 0.08, (0.6, -0.2, 1.1), M["gold"], segments=16)
    # luminária pendente
    cylinder("lamp_fio", 0.006, 1.0, (0.3, 0, 2.85), M["rubber"], segments=6)
    cylinder("lamp_cupula", 0.22, 0.14, (0.3, 0, 2.3), M["metal_green"], segments=20)
    sphere("lamp_bulbo", 0.05, (0.3, 0, 2.2), M["lamp"], subdiv=1)
    # colisores
    collider("balcao", (5.3, 1.0, 1.1), (0, 0, 0.55))
    for x in px:
        for z in pz:
            collider(f"pilar_{x}_{z}", (0.2, 0.2, 3.4), (x, z, 1.7))
    return finish(_parts[start:], "posto_distribuicao")


def banca_feira(M) -> bpy.types.Object:
    """Banca de feira dobrável: tubos, lona listrada, mesa, caixotes com produtos, balança, lousa."""
    start = len(_parts)
    for x in (-1.1, 1.1):
        for y in (-0.7, 0.7):
            cylinder(f"perna_{x}_{y}", 0.02, 2.1, (x, y, 1.05), M["metal_light"], segments=10)
    for y in (-0.7, 0.7):
        cylinder(f"trave_x_{y}", 0.02, 2.3, (0, y, 2.1), M["metal_light"], segments=10, rot=(0, math.pi / 2, 0))
    for x in (-1.1, 1.1):
        cylinder(f"trave_y_{x}", 0.02, 1.5, (x, 0, 2.1), M["metal_light"], segments=10, rot=(math.pi / 2, 0, 0))
    wavy_plane("lona_listrada", 2.6, 1.9, (0, 0, 2.18), M["stripes"], nx=40, ny=16, amp=0.05, freq=5, sag=0.1)
    wavy_plane("lona_aba", 2.6, 0.5, (0, -0.95, 1.92), M["stripes"], rot=(math.radians(80), 0, 0), nx=30, ny=6, amp=0.03, freq=7)
    box("mesa", (2.2, 1.0, 0.04), (0, 0, 0.82), M["wood"], bevel=0.006)
    for x in (-1.0, 1.0):
        for y in (-0.42, 0.42):
            box(f"mesa_perna_{x}_{y}", (0.05, 0.05, 0.8), (x, y, 0.4), M["wood"])
    # caixotes com produtos
    def crate(name, loc, mat, produce, count, r):
        box(f"{name}_fundo", (0.5, 0.36, 0.03), (loc[0], loc[1], loc[2] + 0.015), M["wood"])
        for i, (dx, dy) in enumerate(((0, -0.17), (0, 0.17), (-0.24, 0), (0.24, 0))):
            sz = (0.5, 0.025, 0.22) if i < 2 else (0.025, 0.36, 0.22)
            box(f"{name}_lado_{i}", sz, (loc[0] + dx, loc[1] + dy, loc[2] + 0.11), M["wood"])
        import random

        rnd = random.Random(hash(name) & 0xFFFF)
        for i in range(count):
            sphere(f"{name}_p{i}", r * (0.85 + rnd.random() * 0.3), (loc[0] + (rnd.random() - 0.5) * 0.36, loc[1] + (rnd.random() - 0.5) * 0.24, loc[2] + 0.1 + rnd.random() * 0.1), produce, subdiv=1)

    crate("cx_laranja", (-0.7, 0.1, 0.84), M["wood"], M["produce_orange"], 9, 0.045)
    crate("cx_mandioca", (0.0, 0.1, 0.84), M["wood"], M["produce_brown"], 7, 0.05)
    crate("cx_verde", (0.7, 0.1, 0.84), M["wood"], M["produce_green"], 8, 0.05)
    crate("cx_chao", (-0.6, -0.35, 0.0), M["wood"], M["produce_green"], 6, 0.05)
    # balança de prato e lousa de preços
    cylinder("balanca_base", 0.12, 0.04, (0.85, -0.3, 0.86), M["metal_dark"], segments=20)
    cylinder("balanca_haste", 0.015, 0.3, (0.85, -0.3, 1.0), M["metal_light"], segments=8)
    cylinder("balanca_prato", 0.16, 0.015, (0.85, -0.3, 1.16), M["metal_light"], segments=20)
    box("lousa", (0.5, 0.02, 0.4), (-0.95, -0.52, 1.1), M["metal_dark"], bevel=0.005)
    box("lousa_moldura", (0.54, 0.015, 0.44), (-0.95, -0.515, 1.1), M["wood"])
    collider("banca", (2.4, 1.1, 0.9), (0, 0, 0.45))
    return finish(_parts[start:], "banca_feira")


def botijao(M) -> bpy.types.Object:
    start = len(_parts)
    cylinder("corpo", 0.19, 0.5, (0, 0, 0.31), M["metal_light"], segments=28, bevel=0.03)
    cylinder("colar", 0.1, 0.1, (0, 0, 0.6), M["metal_light"], segments=20)
    torus("alca", 0.12, 0.012, (0, 0, 0.66), M["metal_light"], seg_major=24, seg_minor=8)
    cylinder("valvula", 0.025, 0.06, (0, 0, 0.64), M["rust_dark"], segments=12)
    cylinder("base", 0.17, 0.06, (0, 0, 0.03), M["rust_dark"], segments=28)
    collider("botijao", (0.4, 0.4, 0.7), (0, 0, 0.35))
    return finish(_parts[start:], "botijao")


def gerador(M) -> bpy.types.Object:
    start = len(_parts)
    # gaiola tubular
    for x in (-0.55, 0.55):
        for y in (-0.35, 0.35):
            cylinder(f"tubo_v_{x}_{y}", 0.02, 0.9, (x, y, 0.45), M["rust"], segments=10)
    for y in (-0.35, 0.35):
        cylinder(f"tubo_x_{y}", 0.02, 1.14, (0, y, 0.9), M["rust"], segments=10, rot=(0, math.pi / 2, 0))
    for x in (-0.55, 0.55):
        cylinder(f"tubo_y_{x}", 0.02, 0.74, (x, 0, 0.9), M["rust"], segments=10, rot=(math.pi / 2, 0, 0))
    box("chassi", (1.1, 0.7, 0.06), (0, 0, 0.12), M["metal_dark"], bevel=0.01)
    box("tanque", (1.0, 0.6, 0.18), (0, 0, 0.78), M["metal_green"], bevel=0.02)
    cylinder("tampa_tanque", 0.05, 0.04, (0.3, 0.15, 0.89), M["metal_dark"], segments=16)
    box("motor", (0.5, 0.45, 0.45), (-0.2, 0, 0.4), M["metal_dark"], bevel=0.02)
    for k in range(5):
        box(f"aleta_{k}", (0.52, 0.47, 0.02), (-0.2, 0, 0.25 + k * 0.08), M["metal_light"])
    box("alternador", (0.4, 0.3, 0.3), (0.3, 0, 0.35), M["rust_dark"], bevel=0.02)
    cylinder("escape", 0.03, 0.4, (-0.5, -0.2, 0.9), M["rust"], segments=12, rot=(0, math.radians(-20), 0))
    box("painel", (0.26, 0.04, 0.2), (0.4, -0.37, 0.5), M["metal_light"], bevel=0.005)
    sphere("led", 0.015, (0.33, -0.39, 0.55), M["screen"], subdiv=1)
    cylinder("filtro", 0.08, 0.2, (-0.35, 0.3, 0.6), M["rust_dark"], segments=14, rot=(math.pi / 2, 0, 0))
    for x in (-0.4, 0.4):
        cylinder(f"roda_{x}", 0.12, 0.06, (x, 0.4, 0.12), M["rubber"], segments=20, rot=(math.pi / 2, 0, 0))
    cylinder("alca", 0.02, 0.8, (0, -0.42, 0.95), M["rust"], segments=10, rot=(0, math.pi / 2, 0))
    cylinder("cabo", 0.015, 1.6, (-0.3, 0.1, 0.02), M["rubber"], segments=8, rot=(0, math.pi / 2, 0.3))
    collider("gerador", (1.2, 0.8, 0.95), (0, 0, 0.48))
    return finish(_parts[start:], "gerador")


def barril_metal(M) -> bpy.types.Object:
    start = len(_parts)
    cylinder("corpo", 0.29, 0.88, (0, 0, 0.44), M["rust"], segments=32, bevel=0.015)
    for z in (0.3, 0.58):
        torus(f"nervura_{z}", 0.29, 0.016, (0, 0, z), M["rust_dark"], seg_major=32, seg_minor=8)
    torus("aro_topo", 0.285, 0.014, (0, 0, 0.875), M["rust_dark"], seg_major=32, seg_minor=8)
    cylinder("tampa", 0.26, 0.01, (0, 0, 0.885), M["rust_dark"], segments=32)
    cylinder("bujao", 0.03, 0.02, (0.15, 0.1, 0.9), M["metal_dark"], segments=12)
    collider("barril", (0.6, 0.6, 0.9), (0, 0, 0.45))
    return finish(_parts[start:], "barril_metal")


def banco_praca(M) -> bpy.types.Object:
    start = len(_parts)
    for x in (-0.75, 0.75):
        box(f"pe_{x}", (0.12, 0.5, 0.42), (x, 0, 0.21), M["concrete_dark"], bevel=0.02)
        box(f"encosto_pe_{x}", (0.1, 0.08, 0.5), (x, 0.24, 0.6), M["concrete_dark"], bevel=0.015, rot=(math.radians(-12), 0, 0))
    for k in range(4):
        box(f"ripa_{k}", (1.8, 0.09, 0.035), (0, -0.2 + k * 0.12, 0.44), M["wood"], bevel=0.005)
    for k in range(2):
        box(f"ripa_enc_{k}", (1.8, 0.035, 0.09), (0, 0.27 + k * 0.025, 0.62 + k * 0.12), M["wood"], bevel=0.005, rot=(math.radians(-12), 0, 0))
    collider("banco", (1.9, 0.6, 0.9), (0, 0.05, 0.45))
    return finish(_parts[start:], "banco_praca")


def caixa_eletrica(M) -> bpy.types.Object:
    start = len(_parts)
    cylinder("poste", 0.09, 6.0, (0, 0, 3.0), M["concrete"], segments=16)
    box("caixa", (0.5, 0.26, 0.7), (0, -0.2, 1.4), M["metal_green"], bevel=0.012)
    box("caixa_porta", (0.44, 0.02, 0.62), (0, -0.34, 1.4), M["metal_green"], bevel=0.006)
    box("caixa_visor", (0.16, 0.012, 0.12), (0.08, -0.35, 1.55), M["glass_dark"])
    cylinder("cadeado", 0.02, 0.05, (-0.18, -0.36, 1.12), M["metal_light"], segments=10)
    for k in range(3):
        cylinder(f"conduite_{k}", 0.02, 1.3, (-0.15 + k * 0.15, -0.2, 0.65), M["rust_dark"], segments=8)
    box("cruzeta", (1.2, 0.08, 0.1), (0, 0, 5.6), M["wood"])
    for x in (-0.5, 0, 0.5):
        cylinder(f"isolador_{x}", 0.04, 0.12, (x, 0, 5.72), M["glass_dark"], segments=12)
    # fios caindo para a fachada (curvas simples)
    for k, x in enumerate((-0.5, 0, 0.5)):
        cylinder(f"fio_{k}", 0.008, 7.0, (x, 3.4, 5.6), M["rubber"], segments=6, rot=(math.radians(84), 0, 0))
    collider("poste", (0.3, 0.3, 6.0), (0, 0, 3.0))
    return finish(_parts[start:], "caixa_eletrica")


def fachada_residencial(M, variant: int = 0) -> bpy.types.Object:
    """Módulo residencial brasileiro de 8 m × 3 pavimentos (10 m): térreo com porta e janela gradeada,
    pavimentos com janelas rebaixadas (uma vedada com tábuas), varandas com grade, varal com roupas,
    tubulação, ar-condicionado, caixa d'água na laje, platibanda e manchas. `variant` muda o reboco."""
    start = len(_parts)
    W, D, H = 8.0, 0.5, 10.0
    plaster = M["plaster_warm"] if variant == 0 else M["plaster_sand"]
    wall = box("parede", (W, D, H), (0, D / 2, H / 2), plaster)
    cutters = []
    fh = 3.1
    # térreo: porta + 2 janelas gradeadas
    cutters.append(box("cut_porta", (1.1, 1.5, 2.2), (-2.6, 0, 1.1 + 0.1), plaster))
    for i, x in enumerate((0.0, 2.6)):
        cutters.append(box(f"cut_t{i}", (1.3, 1.5, 1.3), (x, 0, 1.75), plaster))
    for floor in (1, 2):
        for i, x in enumerate((-2.6, 0.0, 2.6)):
            cutters.append(box(f"cut_{floor}_{i}", (1.3, 1.5, 1.5), (x, 0, floor * fh + 1.55), plaster))
    cut(wall, cutters)
    bev = wall.modifiers.new("bevel", "BEVEL")
    bev.width = 0.012
    bev.segments = 2
    bev.limit_method = "ANGLE"
    bev.angle_limit = math.radians(40)
    box("retorno_e", (0.5, 1.6, H), (-W / 2 + 0.25, D + 0.8, H / 2), plaster, bevel=0.012)
    box("retorno_d", (0.5, 1.6, H), (W / 2 - 0.25, D + 0.8, H / 2), plaster, bevel=0.012)
    box("rodape", (W + 0.1, 0.58, 0.5), (0, 0.25, 0.25), M["concrete_dark"], bevel=0.015)
    box("platibanda", (W + 0.1, 0.6, 0.6), (0, 0.22, H + 0.3), plaster, bevel=0.012)
    box("platibanda_topo", (W + 0.3, 0.7, 0.07), (0, 0.2, H + 0.63), M["concrete"], bevel=0.012)
    for floor in (1, 2):
        box(f"laje_{floor}", (W + 0.2, 0.62, 0.12), (0, 0.2, floor * fh + 0.02), M["concrete"], bevel=0.012)

    def window(x, z0, h, i, lit=False, boarded=False, bars=False):
        box(f"peitoril_{i}", (1.5, 0.4, 0.07), (x, 0.08, z0 - 0.035), M["concrete"], bevel=0.008)
        fr = M["metal_dark"]
        t = 0.05
        box(f"cx_e_{i}", (t, 0.07, h), (x - 0.65 + t / 2, 0.34, z0 + h / 2), fr)
        box(f"cx_d_{i}", (t, 0.07, h), (x + 0.65 - t / 2, 0.34, z0 + h / 2), fr)
        box(f"cx_t_{i}", (1.3, 0.07, t), (x, 0.34, z0 + h - t / 2), fr)
        box(f"cx_m_{i}", (1.3, 0.07, t), (x, 0.34, z0 + h / 2), fr)
        if boarded:
            for k in range(3):
                box(f"tabua_{i}_{k}", (1.36, 0.05, 0.24), (x, 0.3, z0 + 0.25 + k * 0.48), M["wood"], rot=(0, (k - 1) * 0.08, 0), bevel=0.005)
        else:
            box(f"vidro_{i}", (1.22, 0.02, h - 0.08), (x, 0.37, z0 + h / 2), M["glass_lit"] if lit else M["glass_dark"])
        if bars:
            for k in range(4):
                cylinder(f"grade_{i}_{k}", 0.011, h - 0.04, (x - 0.45 + k * 0.3, 0.2, z0 + h / 2), fr, segments=8)
        wavy_plane(f"mancha_{i}", 1.3, 0.8, (x, -0.004, z0 - 0.47), M["stain"], rot=(math.pi / 2, 0, 0), nx=2, ny=2, amp=0)

    window(0.0, 1.1, 1.3, "t0", bars=True)
    window(2.6, 1.1, 1.3, "t1", bars=True, lit=(variant == 1))
    # porta de madeira com batente e degrau
    box("porta", (1.0, 0.05, 2.1), (-2.6, 0.38, 1.15), M["wood"], bevel=0.006)
    box("porta_batente", (1.2, 0.08, 0.08), (-2.6, 0.3, 2.3), M["concrete"])
    cylinder("porta_macaneta", 0.018, 0.1, (-2.2, 0.33, 1.1), M["metal_light"], segments=8, rot=(math.pi / 2, 0, 0))
    box("degrau", (1.3, 0.5, 0.12), (-2.6, -0.2, 0.06), M["concrete_dark"], bevel=0.01)
    boarded = {(1, 1): True} if variant == 0 else {(2, 0): True}
    lit = {(1, 2): True, (2, 0): True} if variant == 0 else {(1, 0): True, (2, 2): True}
    for floor in (1, 2):
        for i, x in enumerate((-2.6, 0.0, 2.6)):
            window(x, floor * fh + 0.8, 1.5, f"{floor}_{i}", lit=lit.get((floor, i), False), boarded=boarded.get((floor, i), False))
    # varandas (uma por andar, em janelas alternadas), com grade e varal
    for floor, x in ((1, 2.6), (2, -2.6)) if variant == 0 else ((1, -2.6), (2, 2.6)):
        z = floor * fh + 0.8
        box(f"varanda_{floor}", (2.0, 1.0, 0.14), (x, -0.5, z - 0.07), M["concrete"], bevel=0.012)
        box(f"varanda_lado_{floor}", (2.0, 0.04, 0.9), (x, -0.98, z + 0.45), M["rust_dark"])
        for k in range(7):
            cylinder(f"varanda_barra_{floor}_{k}", 0.012, 0.9, (x - 0.9 + k * 0.3, -0.98, z + 0.45), M["metal_dark"], segments=8)
        for side in (-1.0, 1.0):
            box(f"varanda_lat_{floor}_{side}", (0.04, 1.0, 0.04), (x + side * 0.98, -0.5, z + 0.9), M["metal_dark"])
            for k in range(3):
                cylinder(f"varanda_lat_b_{floor}_{side}_{k}", 0.012, 0.9, (x + side * 0.98, -0.2 - k * 0.3, z + 0.45), M["metal_dark"], segments=8)
        # varal com roupas
        cylinder(f"varal_{floor}", 0.006, 1.9, (x, -0.7, z + 1.6), M["rubber"], segments=6, rot=(0, math.pi / 2, 0))
        for k, (w, h, mat) in enumerate(((0.45, 0.6, "fabric_cream"), (0.35, 0.5, "fabric_olive"), (0.4, 0.55, "stripes"))):
            wavy_plane(f"roupa_{floor}_{k}", w, h, (x - 0.6 + k * 0.6, -0.7, z + 1.6 - h / 2), M[mat], rot=(math.pi / 2, 0, 0), nx=6, ny=6, amp=0.02, freq=3)
    # tubulação, AC, caixa d'água
    cylinder("calha", 0.05, H - 0.3, (W / 2 - 0.35, -0.08, H / 2), M["rust"], segments=14)
    for z in (1.5, 4.5, 7.5):
        box(f"bracadeira_{z}", (0.16, 0.18, 0.05), (W / 2 - 0.35, -0.02, z), M["metal_dark"], bevel=0.006)
    cylinder("esgoto", 0.07, 3.0, (-W / 2 + 0.35, -0.1, 1.5), M["rust_dark"], segments=14)
    ac_x = 0.0 if variant == 0 else -2.6
    box("ac", (0.7, 0.34, 0.48), (ac_x, -0.18, 2 * fh + 0.4), M["metal_light"], bevel=0.012)
    for k in range(5):
        box(f"ac_grelha_{k}", (0.55, 0.02, 0.03), (ac_x, -0.36, 2 * fh + 0.25 + k * 0.07), M["metal_dark"])
    box("ac_suporte", (0.6, 0.4, 0.04), (ac_x, -0.18, 2 * fh + 0.14), M["rust_dark"])
    cylinder("caixa_dagua", 0.55, 0.9, (1.8, 1.6, H + 1.1), M["plastic_blue"], segments=24, bevel=0.03)
    cylinder("caixa_dagua_tampa", 0.58, 0.08, (1.8, 1.6, H + 1.58), M["plastic_blue"], segments=24)
    for dx, dy in ((-0.4, 1.2), (0.4, 1.2), (-0.4, 2.0), (0.4, 2.0)):
        box(f"caixa_pe_{dx}_{dy}", (0.08, 0.08, 0.7), (1.8 + dx, dy, H + 0.35), M["rust_dark"])
    for x in (-3.4, 1.2):
        wavy_plane(f"mancha_base_{x}", 1.6, 1.0, (x, -0.004, 0.95), M["stain"], rot=(math.pi / 2, 0, 0), nx=2, ny=2, amp=0)
    cylinder("cabo", 0.01, W - 0.6, (0, -0.06, H - 1.2), M["rubber"], segments=6, rot=(0, math.pi / 2, 0))
    collider("fachada_res", (W + 0.4, 0.9, H + 0.7), (0, 0.3, (H + 0.7) / 2))
    collider("degrau_res", (1.3, 0.6, 0.12), (-2.6, -0.2, 0.06))
    return finish(_parts[start:], f"fachada_residencial_{variant}")


def caixote(M) -> bpy.types.Object:
    """Caixote de ripas de madeira (feira/estoque), 55 cm, com cantoneiras."""
    start = len(_parts)
    s = 0.55
    box("fundo", (s - 0.04, s - 0.04, 0.02), (0, 0, 0.03), M["wood"], bevel=0.003)
    for side in range(4):
        ang = side * math.pi / 2
        R = Matrix.Rotation(ang, 3, "Z")
        for k in range(3):
            box(f"ripa_{side}_{k}", (s, 0.02, 0.12), R @ Vector((0, -s / 2 + 0.01, 0.1 + k * 0.19)), M["wood"], rot=(0, 0, ang), bevel=0.003)
        for j, dx in enumerate((-s / 2 + 0.03, s / 2 - 0.03)):
            box(f"canto_{side}_{j}", (0.03, 0.03, s), R @ Vector((dx, -s / 2 + 0.015, s / 2)), M["wood"], rot=(0, 0, ang), bevel=0.003)
    collider("caixote", (s, s, s), (0, 0, s / 2))
    return finish(_parts[start:], "caixote")


def barril_plastico(M) -> bpy.types.Object:
    """Tambor plástico de 200 L com nervuras, tampa com aro e torneira."""
    start = len(_parts)
    cylinder("corpo", 0.29, 0.9, (0, 0, 0.45), M["plastic_blue"], segments=32, bevel=0.02)
    for z in (0.22, 0.62):
        torus(f"nervura_{z}", 0.295, 0.02, (0, 0, z), M["plastic_blue"], seg_major=32, seg_minor=8)
    torus("aro", 0.3, 0.018, (0, 0, 0.9), M["metal_dark"], seg_major=32, seg_minor=8)
    cylinder("tampa", 0.27, 0.02, (0, 0, 0.91), M["plastic_blue"], segments=32)
    cylinder("torneira", 0.02, 0.1, (0, -0.33, 0.15), M["metal_light"], segments=10, rot=(math.pi / 2, 0, 0))
    cylinder("torneira_bico", 0.012, 0.06, (0, -0.38, 0.12), M["metal_light"], segments=8)
    collider("barril_p", (0.6, 0.6, 0.92), (0, 0, 0.46))
    return finish(_parts[start:], "barril_plastico")


def poste_luz(M) -> bpy.types.Object:
    """Poste de iluminação de concreto com braço curvo, luminária de rua e caixa de passagem.
    A luz (SpotLight) continua sendo criada pelo jogo em props.streetLamp."""
    start = len(_parts)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.11, radius2=0.07, depth=6.4)
    mesh = bpy.data.meshes.new("poste")
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new("poste", mesh)
    o.location = Vector((0, 0, 3.2))
    o.data.materials.append(M["concrete"])
    _link(o)
    box("base", (0.4, 0.4, 0.3), (0, 0, 0.15), M["concrete_dark"], bevel=0.02)
    # braço curvo (segmentos)
    pts = [(0, 0, 6.2), (0, -0.35, 6.42), (0, -0.8, 6.52), (0, -1.25, 6.52)]
    for i in range(len(pts) - 1):
        a, b = Vector(pts[i]), Vector(pts[i + 1])
        mid = (a + b) / 2
        d = b - a
        length = d.length
        o = cylinder(f"braco_{i}", 0.035, length, mid, M["metal_green"], segments=10)
        o.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    box("luminaria", (0.32, 0.7, 0.16), (0, -1.5, 6.45), M["metal_green"], bevel=0.015)
    box("luminaria_vidro", (0.26, 0.6, 0.03), (0, -1.5, 6.36), M["lamp"])
    box("caixa_passagem", (0.22, 0.14, 0.3), (0, -0.14, 1.2), M["metal_green"], bevel=0.008)
    cylinder("conduite", 0.016, 1.0, (0, -0.14, 0.55), M["rust_dark"], segments=8)
    collider("poste_luz", (0.26, 0.26, 6.4), (0, 0, 3.2))
    return finish(_parts[start:], "poste_luz")


def arvore(M, variant: int = 0) -> bpy.types.Object:
    """Árvore urbana (~5,5 m): tronco afunilado com raízes, 5 galhos e copa de cartões de folhagem
    (alpha-clip, dupla face) em 4 aglomerados. O jogo instancia com escala/rotação diferentes."""
    import random

    start = len(_parts)
    rnd = random.Random(40 + variant)
    H = 3.3
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.24, radius2=0.12, depth=H)
    mesh = bpy.data.meshes.new("tronco")
    bm.to_mesh(mesh)
    bm.free()
    o = bpy.data.objects.new("tronco", mesh)
    o.location = Vector((0, 0, H / 2))
    o.rotation_euler = (0.03, 0.02, 0)
    o.data.materials.append(M["bark"])
    _link(o)
    for k in range(4):
        a = k * math.tau / 4 + 0.4
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.13, radius2=0.04, depth=0.7)
        mesh = bpy.data.meshes.new(f"raiz_{k}")
        bm.to_mesh(mesh)
        bm.free()
        r = bpy.data.objects.new(f"raiz_{k}", mesh)
        r.location = Vector((math.cos(a) * 0.32, math.sin(a) * 0.32, 0.02))
        r.rotation_euler = (Vector((math.cos(a), math.sin(a), 0.22)).to_track_quat("Z", "Y")).to_euler()
        r.data.materials.append(M["bark"])
        _link(r)
    crowns = []
    for k in range(5):
        a = k * math.tau / 5 + rnd.random() * 0.6
        tilt = 0.55 + rnd.random() * 0.35
        length = 1.5 + rnd.random() * 0.6
        d = Vector((math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt)))
        base = Vector((0, 0, H - 0.5 + rnd.random() * 0.4))
        mid = base + d * (length / 2)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=0.08, radius2=0.03, depth=length)
        mesh = bpy.data.meshes.new(f"galho_{k}")
        bm.to_mesh(mesh)
        bm.free()
        g = bpy.data.objects.new(f"galho_{k}", mesh)
        g.location = mid
        g.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
        g.data.materials.append(M["bark"])
        _link(g)
        crowns.append(base + d * (length * 0.85))
    crowns.append(Vector((0, 0, H + 1.25)))
    crowns.append(Vector((0.5, -0.3, H + 0.55)))
    crowns.append(Vector((-0.45, 0.4, H + 0.7)))
    # cartões de folhagem: 4 planos cruzados por aglomerado (+1 horizontal), levemente curvados
    for ci, c in enumerate(crowns):
        size_w = 1.9 + rnd.random() * 0.8
        size_h = 1.4 + rnd.random() * 0.5
        for j in range(4):
            yaw = j * math.pi / 4 + rnd.random() * 0.35
            pitch = (rnd.random() - 0.5) * 0.6
            wavy_plane(f"folhas_{ci}_{j}", size_w, size_h, (c.x, c.y, c.z), M["leaves"], rot=(math.pi / 2 + pitch, 0, yaw), nx=4, ny=4, amp=0.07, freq=1.5)
        wavy_plane(f"folhas_{ci}_h", size_w * 0.9, size_w * 0.9, (c.x, c.y, c.z + 0.2), M["leaves"], rot=(0.25, 0.1, rnd.random()), nx=4, ny=4, amp=0.08, freq=1.5)
    collider("tronco", (0.5, 0.5, H), (0, 0, H / 2))
    return finish(_parts[start:], f"arvore_{variant}", smooth=True)


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------
def export(roots: list[bpy.types.Object], path: str):
    objs = []
    for r in roots:
        objs.append(r)
        objs.extend(r.children_recursive)
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = roots[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="JPEG",
        export_jpeg_quality=82,
        export_animations=False,
        export_skins=False,
        export_extras=True,
    )
    tris = sum(len(p.vertices) - 2 for o in objs if o.type == "MESH" for p in o.data.polygons)
    log(f"exportado {path} ({os.path.getsize(path) / 1024:.0f} KB, {tris} triângulos, {len([o for o in objs if o.type == 'MESH'])} malhas)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(REPO, "public", "assets", "environments", "praca_hero.glb"))
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    t0 = time.time()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    M = materials()
    builders = {
        "fachada_central": facade_central,
        "posto_distribuicao": posto_distribuicao,
        "banca_feira": banca_feira,
        "botijao": botijao,
        "gerador": gerador,
        "barril_metal": barril_metal,
        "banco_praca": banco_praca,
        "caixa_eletrica": caixa_eletrica,
        "fachada_residencial_0": lambda M: fachada_residencial(M, 0),
        "fachada_residencial_1": lambda M: fachada_residencial(M, 1),
        "caixote": caixote,
        "barril_plastico": barril_plastico,
        "poste_luz": poste_luz,
        "arvore_0": lambda M: arvore(M, 0),
        "arvore_1": lambda M: arvore(M, 1),
    }
    names = [n for n in args.only.split(",") if n] or list(builders)
    roots = []
    for n in names:
        t = time.time()
        roots.append(builders[n](M))
        log(f"{n}: {time.time() - t:.1f}s")
    export(roots, args.out)
    log(f"concluído em {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
