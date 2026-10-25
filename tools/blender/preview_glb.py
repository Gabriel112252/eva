#!/usr/bin/env python3.11
"""Renderiza pré-visualizações (Cycles, CPU) de um GLB de personagem: corpo inteiro, rosto e uma pose de animação.

Uso: python3.11 tools/blender/preview_glb.py <arquivo.glb> <pasta_saida> [--clip Walk] [--frame 20] [--samples 48]
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def setup_scene(samples: int):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = False
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 88
    scene.view_settings.view_transform = "Filmic" if "Filmic" in [i.name for i in bpy.types.ColorManagedViewSettings.bl_rna.properties["view_transform"].enum_items] else "AgX"
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.62, 0.7, 1)
    bg.inputs[1].default_value = 0.7
    # sol quente + preenchimento
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.5
    sun.color = (1.0, 0.93, 0.82)
    sun.angle = math.radians(2)
    so = bpy.data.objects.new("sun", sun)
    scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), math.radians(-15), math.radians(35))
    fill = bpy.data.lights.new("fill", "AREA")
    fill.energy = 120
    fill.size = 2.5
    fo = bpy.data.objects.new("fill", fill)
    scene.collection.objects.link(fo)
    fo.location = (-1.6, -2.2, 1.6)
    fo.rotation_euler = (math.radians(70), 0, math.radians(-35))
    # chão neutro
    bpy.ops.mesh.primitive_plane_add(size=12)
    ground = bpy.context.active_object
    gm = bpy.data.materials.new("ground")
    gm.use_nodes = True
    gm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.35, 0.33, 0.3, 1)
    gm.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    ground.data.materials.append(gm)
    return scene


def add_camera(scene, location, target, lens=50, res=(640, 960)):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = lens
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    cam.location = location
    direction = Vector(target) - Vector(location)
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam
    scene.render.resolution_x, scene.render.resolution_y = res
    return cam


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("glb")
    ap.add_argument("out")
    ap.add_argument("--clip", default="Walk")
    ap.add_argument("--frame", type=int, default=16)
    ap.add_argument("--samples", type=int, default=48)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    scene = setup_scene(args.samples)
    bpy.ops.import_scene.gltf(filepath=args.glb)
    arm = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name != "Plane"]
    # limites
    zs = [v.z for o in meshes for v in [o.matrix_world @ vv.co for vv in o.data.vertices]]
    height = max(zs) - min(zs)
    base = os.path.splitext(os.path.basename(args.glb))[0]
    head_z = max(zs) - 0.12
    # pose de animação: usa a ação importada se existir
    if arm is not None and arm.animation_data:
        tracks = list(arm.animation_data.nla_tracks)
        print("trilhas NLA:", [t.name for t in tracks], "ações:", [a.name for a in bpy.data.actions])
        chosen = next((t for t in tracks if t.name == args.clip or t.name.startswith(args.clip)), None)
        for t in tracks:
            t.mute = t is not chosen
        if chosen is not None:
            arm.animation_data.action = None  # a ação ativa (importada) sobreporia a trilha NLA
            chosen.is_solo = True
            scene.frame_set(args.frame)
            bpy.context.view_layer.update()
        else:
            action = next((a for a in bpy.data.actions if a.name == args.clip or a.name.startswith(args.clip)), None)
            if action is not None:
                arm.animation_data.action = action
                if hasattr(action, "slots") and len(action.slots) and hasattr(arm.animation_data, "action_slot"):
                    arm.animation_data.action_slot = action.slots[0]
                scene.frame_set(args.frame)
    hi = args.samples >= 48
    # 1) corpo inteiro 3/4
    add_camera(scene, (1.9, -3.4, height * 0.62), (0, 0, height * 0.5), 50, (900, 1350) if hi else (640, 960))
    scene.render.filepath = os.path.join(args.out, f"{base}_corpo.jpg")
    bpy.ops.render.render(write_still=True)
    # 2) rosto
    add_camera(scene, (0.35, -0.75, head_z + 0.02), (0, 0, head_z - 0.03), 85, (900, 900) if hi else (640, 640))
    scene.render.filepath = os.path.join(args.out, f"{base}_rosto.jpg")
    bpy.ops.render.render(write_still=True)
    # 3) costas / perfil
    add_camera(scene, (-2.6, 2.6, height * 0.6), (0, 0, height * 0.5), 50, (640, 960))
    scene.render.filepath = os.path.join(args.out, f"{base}_costas.jpg")
    bpy.ops.render.render(write_still=True)
    print("ok", args.out)


if __name__ == "__main__":
    main()
