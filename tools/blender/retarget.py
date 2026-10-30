"""Retarget de animações da Quaternius Universal Animation Library (rig estilo Unreal, CC0)
para o rig Mixamo de 52 ossos dos personagens do jogo (gerado por make_character.py).

Método (independente de roll/proporções):
  para cada par de ossos (fonte s, alvo t) e cada frame f
      T_pose(f) = S_pose(f) · S_rest⁻¹ · (S_can · T_can⁻¹) · T_rest
  S_can/T_can são "quadros canônicos" construídos do mesmo jeito nos dois rigs
  (Y = direção anatômica do osso até a junta filha; Z = referência mundial — frente ou cima —
  projetada perpendicular ao osso). Assim a pose de descanso diferente (T-pose × A-pose),
  o roll dos ossos e os tamanhos dos membros não importam: transfere-se a rotação
  relativa de cada osso no espaço do mundo. A translação do quadril é copiada escalada
  pela razão das alturas dos quadris.

Uso como módulo (dentro do Blender/bpy):
    from retarget import load_library, retarget_clips
    lib = load_library(path_glb)
    retarget_clips(lib, target_armature, CLIPS)
Uso em linha de comando (desenvolvimento): ver main() no fim.
"""
from __future__ import annotations

import math
import os
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

FPS = 30

# osso da biblioteca -> osso do jogo
BONE_MAP: dict[str, str] = {
    "pelvis": "mixamorig:Hips",
    "spine_01": "mixamorig:Spine",
    "spine_02": "mixamorig:Spine1",
    "spine_03": "mixamorig:Spine2",
    "neck_01": "mixamorig:Neck",
    "Head": "mixamorig:Head",
    "clavicle_l": "mixamorig:LeftShoulder",
    "upperarm_l": "mixamorig:LeftArm",
    "lowerarm_l": "mixamorig:LeftForeArm",
    "hand_l": "mixamorig:LeftHand",
    "clavicle_r": "mixamorig:RightShoulder",
    "upperarm_r": "mixamorig:RightArm",
    "lowerarm_r": "mixamorig:RightForeArm",
    "hand_r": "mixamorig:RightHand",
    "thigh_l": "mixamorig:LeftUpLeg",
    "calf_l": "mixamorig:LeftLeg",
    "foot_l": "mixamorig:LeftFoot",
    "ball_l": "mixamorig:LeftToeBase",
    "thigh_r": "mixamorig:RightUpLeg",
    "calf_r": "mixamorig:RightLeg",
    "foot_r": "mixamorig:RightFoot",
    "ball_r": "mixamorig:RightToeBase",
}
for _side, _S in (("l", "Left"), ("r", "Right")):
    for _finger, _F in (("index", "Index"), ("middle", "Middle"), ("ring", "Ring"), ("pinky", "Pinky"), ("thumb", "Thumb")):
        for _i in (1, 2, 3):
            BONE_MAP[f"{_finger}_0{_i}_{_side}"] = f"mixamorig:{_S}Hand{_F}{_i}"

# junta filha que define a direção anatômica do osso (quando há mais de um filho ou nenhum)
MAIN_CHILD_SRC = {
    "pelvis": "spine_01",
    "spine_03": "neck_01",
    "hand_l": "middle_01_l",
    "hand_r": "middle_01_r",
    "foot_l": "ball_l",
    "foot_r": "ball_r",
    "ball_l": "ball_leaf_l",
    "ball_r": "ball_leaf_r",
    "clavicle_l": "upperarm_l",
    "clavicle_r": "upperarm_r",
}
MAIN_CHILD_TGT = {
    "mixamorig:Hips": "mixamorig:Spine",
    "mixamorig:Spine2": "mixamorig:Neck",
    "mixamorig:LeftHand": "mixamorig:LeftHandMiddle1",
    "mixamorig:RightHand": "mixamorig:RightHandMiddle1",
    "mixamorig:LeftFoot": "mixamorig:LeftToeBase",
    "mixamorig:RightFoot": "mixamorig:RightToeBase",
}

FORWARD = Vector((0.0, -1.0, 0.0))  # personagens olham para -Y no Blender (= +Z no glTF)
UP = Vector((0.0, 0.0, 1.0))


def _ref_vector(target_bone: str) -> Vector:
    """Referência mundial para o roll do quadro canônico: cima para pés/dedos do pé, frente para o resto."""
    if "Foot" in target_bone or "ToeBase" in target_bone:
        return UP
    return FORWARD


def _bone_dir(arm, bone_name: str, main_child: dict[str, str]) -> Vector:
    """Direção anatômica (mundo) do osso: cabeça -> junta filha principal; folhas usam a cauda do próprio osso."""
    data = arm.data.bones
    bone = data[bone_name]
    mw = arm.matrix_world
    head = mw @ bone.head_local
    child_name = main_child.get(bone_name)
    if child_name is None:
        kids = [c for c in bone.children]
        if len(kids) == 1:
            child_name = kids[0].name
    if child_name is not None and child_name in data:
        d = (mw @ data[child_name].head_local) - head
        if d.length > 1e-4:
            return d.normalized()
    d = (mw @ bone.tail_local) - head
    if d.length > 1e-6:
        return d.normalized()
    return UP.copy()


def _canonical_frame(direction: Vector, ref: Vector) -> Matrix:
    """Quadro ortonormal 3x3 com Y = direção do osso e Z = referência projetada perpendicular."""
    y = direction.normalized()
    z = ref - y * ref.dot(y)
    if z.length < 1e-3:
        # referência quase paralela ao osso: usa a outra
        alt = UP if abs(ref.dot(UP)) < 0.9 else FORWARD
        z = alt - y * alt.dot(y)
    z.normalize()
    x = y.cross(z).normalized()
    m = Matrix.Identity(3)
    m.col[0] = x
    m.col[1] = y
    m.col[2] = z
    return m


class AnimationLibrary:
    def __init__(self, arm, actions: dict[str, bpy.types.Action]):
        self.arm = arm
        self.actions = actions


def load_library(glb_path: str) -> AnimationLibrary:
    """Importa o GLB da biblioteca (armadura + ações). Mantém os objetos fora da seleção/exportação."""
    before = set(bpy.data.objects)
    before_actions = set(bpy.data.actions)
    bpy.ops.import_scene.gltf(filepath=glb_path, bone_heuristic="BLENDER")
    new_objs = [o for o in bpy.data.objects if o not in before]
    arm = next(o for o in new_objs if o.type == "ARMATURE")
    actions = {a.name: a for a in bpy.data.actions if a not in before_actions}
    for o in new_objs:
        # não esconder na viewport: objetos ocultos não são avaliados pelo depsgraph (pose ficaria parada)
        o.hide_render = True
        o.select_set(False)
    # o importador guarda cada animação numa trilha NLA: silencia todas; só a ação ativa dirige a pose
    if arm.animation_data:
        for tr in arm.animation_data.nla_tracks:
            tr.mute = True
            tr.is_solo = False
        arm.animation_data.action = None
    return AnimationLibrary(arm, actions)


def _set_action(arm, action):
    arm.animation_data_create()
    arm.animation_data.action = action
    if action is not None and hasattr(action, "slots") and len(action.slots) and hasattr(arm.animation_data, "action_slot"):
        arm.animation_data.action_slot = action.slots[0]


def _frame_is_duplicate(src_arm, action, f_first: int, f_last: int) -> bool:
    """Loops exportados costumam repetir o 1º frame no último; detecta para não duplicar."""
    scene = bpy.context.scene
    _set_action(src_arm, action)
    scene.frame_set(f_first)
    a = {pb.name: pb.matrix.copy() for pb in src_arm.pose.bones}
    scene.frame_set(f_last)
    diff = 0.0
    for pb in src_arm.pose.bones:
        m = pb.matrix
        diff = max(diff, max(abs(m[i][j] - a[pb.name][i][j]) for i in range(4) for j in range(4)))
    return diff < 1e-3


def retarget_action(lib: AnimationLibrary, tgt_arm, src_name: str, dst_name: str, loop: bool, hips_scale: float | None = None, start_offset: int = 0, max_frames: int | None = None, frame_range: tuple[int, int] | None = None):
    """Cria uma Action `dst_name` no alvo com a animação `src_name` da biblioteca.
    `frame_range` (primeiro, último — inclusivos, em quadros da fonte) recorta clipes únicos: tira a antecipação
    do pulo/rolamento para a resposta ao botão ser imediata."""
    src_arm = lib.arm
    action = lib.actions[src_name]
    scene = bpy.context.scene
    f0 = int(round(action.frame_range[0]))
    f1 = int(round(action.frame_range[1]))
    if loop and f1 > f0 and _frame_is_duplicate(src_arm, action, f0, f1):
        f1 -= 1
    frames = list(range(f0, f1 + 1))
    if frame_range is not None:
        frames = [f for f in frames if frame_range[0] <= f <= frame_range[1]]
    if start_offset:
        frames = frames[start_offset:] + frames[:start_offset]
    if max_frames:
        frames = frames[:max_frames]

    mw_s = src_arm.matrix_world
    mw_t = tgt_arm.matrix_world
    mw_t_inv = mw_t.inverted()
    tbones = tgt_arm.data.bones
    sbones = src_arm.data.bones

    # pares válidos, em ordem hierárquica do alvo (pais antes dos filhos)
    order: list[str] = []

    def walk(bone):
        order.append(bone.name)
        for c in bone.children:
            walk(c)

    for root in (b for b in tbones if b.parent is None):
        walk(root)
    inv_map = {v: k for k, v in BONE_MAP.items() if k in sbones and v in tbones}

    # quadros canônicos e alinhamento por osso (constantes)
    align: dict[str, Matrix] = {}
    s_rest_inv: dict[str, Matrix] = {}
    t_rest: dict[str, Matrix] = {}
    for t_name in order:
        s_name = inv_map.get(t_name)
        if s_name is None:
            continue
        ref = _ref_vector(t_name)
        s_can = _canonical_frame(_bone_dir(src_arm, s_name, MAIN_CHILD_SRC), ref)
        t_can = _canonical_frame(_bone_dir(tgt_arm, t_name, MAIN_CHILD_TGT), ref)
        align[t_name] = s_can @ t_can.inverted()
        s_rest_inv[s_name] = (mw_s @ sbones[s_name].matrix_local).to_3x3().inverted()
        t_rest[t_name] = (mw_t @ tbones[t_name].matrix_local).to_3x3()

    # translação do quadril: escala pela altura do quadril em repouso
    hips_t = "mixamorig:Hips"
    hips_s = inv_map[hips_t]
    s_hip_rest_pos = (mw_s @ sbones[hips_s].matrix_local).translation.copy()
    t_hip_rest_pos = (mw_t @ tbones[hips_t].matrix_local).translation.copy()
    if hips_scale is None:
        hips_scale = t_hip_rest_pos.z / max(1e-3, s_hip_rest_pos.z)

    new_action = bpy.data.actions.new(dst_name)
    _set_action(tgt_arm, new_action)
    for pb in tgt_arm.pose.bones:
        pb.rotation_mode = "QUATERNION"
        pb.location = Vector((0, 0, 0))
        pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
        pb.scale = Vector((1, 1, 1))

    _set_action(src_arm, action)
    for k, f in enumerate(frames):
        scene.frame_set(f)
        world_rot: dict[str, Matrix] = {}
        world_mat: dict[str, Matrix] = {}
        for t_name in order:
            s_name = inv_map.get(t_name)
            tbone = tbones[t_name]
            parent = tbone.parent
            if s_name is None:
                # osso sem par: segue o pai (rotação de repouso relativa)
                if parent is None:
                    world_mat[t_name] = mw_t @ tbone.matrix_local
                else:
                    world_mat[t_name] = world_mat[parent.name] @ (tbones[parent.name].matrix_local.inverted() @ tbone.matrix_local)
                continue
            s_pose_rot = (mw_s @ src_arm.pose.bones[s_name].matrix).to_3x3()
            rot = s_pose_rot @ s_rest_inv[s_name] @ align[t_name] @ t_rest[t_name]
            world_rot[t_name] = rot
            if parent is None:
                s_pos = (mw_s @ src_arm.pose.bones[s_name].matrix).translation
                pos = t_hip_rest_pos + (s_pos - s_hip_rest_pos) * hips_scale
                m = rot.to_4x4()
                m.translation = pos
                world_mat[t_name] = m
                basis = (mw_t @ tbone.matrix_local).inverted() @ m
                pb = tgt_arm.pose.bones[t_name]
                pb.location = basis.to_translation()
                pb.rotation_quaternion = basis.to_quaternion()
                pb.keyframe_insert("location", frame=k + 1)
                pb.keyframe_insert("rotation_quaternion", frame=k + 1)
            else:
                # posição: segue a cadeia do pai (ossos não conectados mantêm o offset de repouso)
                parent_world = world_mat[parent.name]
                rest_offset = tbones[parent.name].matrix_local.inverted() @ tbone.matrix_local
                m = parent_world @ rest_offset
                pos = m.translation.copy()
                m = rot.to_4x4()
                m.translation = pos
                world_mat[t_name] = m
                basis = (parent_world @ rest_offset).inverted() @ m
                pb = tgt_arm.pose.bones[t_name]
                pb.rotation_quaternion = basis.to_quaternion()
                pb.keyframe_insert("rotation_quaternion", frame=k + 1)
    _set_action(src_arm, None)
    _set_action(tgt_arm, None)
    return new_action, len(frames)


def push_to_nla(tgt_arm, action, name: str):
    tgt_arm.animation_data_create()
    track = tgt_arm.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 1, action)
    strip.name = name
    track.mute = False
    return track


# clipes do jogo -> (ação da biblioteca, loop)
GAME_CLIPS: dict[str, tuple[str, bool]] = {
    "Idle": ("Idle_Loop", True),
    "Walk": ("Walk_Loop", True),
    "Run": ("Jog_Fwd_Loop", True),
    "CrouchIdle": ("Crouch_Idle_Loop", True),
    "CrouchWalk": ("Crouch_Fwd_Loop", True),
    "Talk": ("Idle_Talking_Loop", True),
    "Interact": ("Interact", False),  # estende a mão e aperta/aponta (rádio, cumprimento)
    "PickUp": ("PickUp_Table", False),  # abaixa e pega um objeto de uma mesa (cartão de registro)
    # combate (pistola), reações e veículos — vertical slice
    "PistolIdle": ("Pistol_Idle_Loop", True),
    "PistolAim": ("Pistol_Aim_Neutral", True),
    "PistolShoot": ("Pistol_Shoot", False),
    "PistolReload": ("Pistol_Reload", False),
    "Hit": ("Hit_Chest", False),
    "Death": ("Death01", False),
    "Driving": ("Driving_Loop", True),
    "Sit": ("Sitting_Idle_Loop", True),
}


# clipes de movimento de ação (pulo, pulo duplo, esquiva, embalo): exportados à parte, só a armadura, em
# public/assets/characters/<personagem>_movimento.glb e ligados em tempo de execução por nome de osso
# (src/player/movementClips.ts). Assim os GLBs dos personagens e o manifesto continuam intactos.
# (fonte, loop[, primeiro quadro, último quadro])
MOVEMENT_CLIPS: dict[str, tuple] = {
    "JumpStart": ("Jump_Start", False, 2, 40),  # sem o agachamento inicial (q. 0-1): impulso já estendido
    "JumpLoop": ("Jump_Loop", True),
    "JumpLand": ("Jump_Land", False, 1, 30),  # impacto, agachamento e volta à postura
    "Roll": ("Roll", False, 2, 44),  # mergulho, rolamento e levantar
    "Sprint": ("Sprint_Loop", True),  # embalo (corrida longa) — velocidade natural ~8,9 m/s
}

CLIP_SETS = {"jogo": GAME_CLIPS, "movimento": MOVEMENT_CLIPS}


def retarget_clips(lib: AnimationLibrary, tgt_arm, clips: dict[str, tuple] = GAME_CLIPS) -> dict[str, int]:
    """Retargeteia todos os clipes do jogo para o alvo e os empilha como trilhas NLA. Devolve frames por clipe."""
    # limpa trilhas antigas
    if tgt_arm.animation_data:
        for tr in list(tgt_arm.animation_data.nla_tracks):
            tgt_arm.animation_data.nla_tracks.remove(tr)
    result = {}
    for dst, spec in clips.items():
        src, loop = spec[0], spec[1]
        frame_range = (spec[2], spec[3]) if len(spec) >= 4 else None
        if src not in lib.actions:
            raise KeyError(f"Animação '{src}' não existe na biblioteca ({sorted(lib.actions)[:5]}…)")
        action, n = retarget_action(lib, tgt_arm, src, dst, loop, frame_range=frame_range)
        push_to_nla(tgt_arm, action, dst)
        result[dst] = n
    # pose neutra para o viewer (sem ação ativa)
    for pb in tgt_arm.pose.bones:
        pb.location = Vector((0, 0, 0))
        pb.rotation_quaternion = Quaternion((1, 0, 0, 0))
    return result


def main():
    """Desenvolvimento: aplica a biblioteca a um GLB existente e reexporta.
    python3.11 tools/blender/retarget.py --library <UAL.glb> --target public/assets/characters/matias.glb --out /tmp/matias_ual.glb

    Biblioteca de movimento (só a armadura + clipes de MOVEMENT_CLIPS, sem malhas — não mexe no GLB do personagem):
    python3.11 tools/blender/retarget.py --library assets-src/animations/ual-standard/standard/Unreal-Godot/UAL1_Standard.glb \
        --target public/assets/characters/matias.glb --clips movimento --anim-only \
        --out public/assets/characters/matias_movimento.glb"""
    import argparse

    ap = argparse.ArgumentParser()
    ap.add_argument("--library", required=True)
    ap.add_argument("--target", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--clips", choices=sorted(CLIP_SETS), default="jogo", help="conjunto de clipes (jogo = GAME_CLIPS; movimento = MOVEMENT_CLIPS)")
    ap.add_argument("--anim-only", action="store_true", help="exporta só a armadura e as animações (biblioteca carregada em tempo de execução)")
    args = ap.parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = FPS
    bpy.ops.import_scene.gltf(filepath=args.target, bone_heuristic="BLENDER")
    tgt = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
    tgt_objs = [o for o in bpy.context.scene.objects]
    # ações importadas do alvo (procedurais antigas) não devem ser exportadas
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    lib = load_library(args.library)
    counts = retarget_clips(lib, tgt, CLIP_SETS[args.clips])
    print("clipes:", counts)
    for o in bpy.context.scene.objects:
        o.select_set(o is tgt if args.anim_only else o in tgt_objs)
    bpy.context.view_layer.objects.active = tgt
    bpy.ops.export_scene.gltf(
        filepath=args.out,
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
    print("ok", args.out, os.path.getsize(args.out))


if __name__ == "__main__":
    main()
