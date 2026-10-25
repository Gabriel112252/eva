#!/usr/bin/env python3.11
"""Folha de contato rápida (Workbench) de um GLB animado: vários clipes × frames, vista 3/4.
Serve para avaliar poses/movimento sem o custo do Cycles.

Uso: python3.11 tools/blender/sheet_glb.py <arquivo.glb> <saida.png> [--clips Idle,Walk,Run] [--frames 1,10,20] [--size 320]
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


def setup(size: int, engine: str):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = engine
    scene.render.resolution_x = size
    scene.render.resolution_y = int(size * 1.5)
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.color = (0.35, 0.37, 0.4)
    bpy.ops.mesh.primitive_plane_add(size=10)
    ground = bpy.context.active_object
    ground.name = "Ground"
    return scene


def camera(scene, height: float, yaw_deg: float):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 45
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    r = 3.6
    a = math.radians(yaw_deg)
    cam.location = Vector((math.sin(a) * r, -math.cos(a) * r, height * 0.58))
    target = Vector((0, 0, height * 0.5))
    cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("glb")
    ap.add_argument("out")
    ap.add_argument("--clips", default="Idle,Walk,Run,CrouchIdle,CrouchWalk,Talk,Interact")
    ap.add_argument("--frames", default="1,12,24,36")
    ap.add_argument("--size", type=int, default=300)
    ap.add_argument("--yaw", type=float, default=35)
    ap.add_argument("--engine", default="BLENDER_WORKBENCH")
    args = ap.parse_args()
    scene = setup(args.size, args.engine)
    scene.render.fps = 30
    bpy.ops.import_scene.gltf(filepath=args.glb)
    arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name != "Ground"]
    zs = [(o.matrix_world @ v.co).z for o in meshes for v in o.data.vertices]
    height = max(zs) - min(zs)
    camera(scene, height, args.yaw)
    arm.animation_data.action = None
    tracks = {t.name: t for t in arm.animation_data.nla_tracks}
    tmp = os.path.splitext(args.out)[0] + "_tiles"
    os.makedirs(tmp, exist_ok=True)
    tiles = []
    for clip in args.clips.split(","):
        track = tracks.get(clip)
        if track is None:
            print("sem trilha", clip, list(tracks))
            continue
        for t in arm.animation_data.nla_tracks:
            t.mute = t is not track
            t.is_solo = False
        track.is_solo = True
        strip = track.strips[0]
        n = int(strip.frame_end - strip.frame_start)
        row = []
        for f in [int(x) for x in args.frames.split(",")]:
            fr = int(strip.frame_start) + (f % max(1, n))
            scene.frame_set(fr)
            bpy.context.view_layer.update()
            path = os.path.join(tmp, f"{clip}_{f:03d}.png")
            scene.render.filepath = path
            bpy.ops.render.render(write_still=True)
            row.append(path)
        tiles.append((clip, row))
    # monta a folha com PIL
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("PIL ausente; tiles em", tmp)
        return
    w, h = args.size, int(args.size * 1.5)
    cols = max(len(r) for _, r in tiles)
    sheet = Image.new("RGB", (cols * w, len(tiles) * (h + 24)), (20, 20, 22))
    draw = ImageDraw.Draw(sheet)
    for r, (clip, row) in enumerate(tiles):
        draw.text((6, r * (h + 24) + 4), clip, fill=(230, 220, 190))
        for c, p in enumerate(row):
            sheet.paste(Image.open(p), (c * w, r * (h + 24) + 24))
    sheet.save(args.out, quality=88)
    print("ok", args.out)


if __name__ == "__main__":
    main()
