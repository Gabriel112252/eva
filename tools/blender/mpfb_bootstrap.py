"""Carrega o MPFB2 (MakeHuman Plugin for Blender) num Blender headless (módulo bpy).

Uso (dentro de scripts): `from mpfb_bootstrap import load_mpfb; load_mpfb()`.
Variável MPFB_SRC aponta para a pasta `src` do repositório mpfb2 clonado.
"""
import os
import sys
import importlib

import bpy


def load_mpfb(mpfb_src: str | None = None):
    mpfb_src = mpfb_src or os.environ.get("MPFB_SRC", "/home/claude/tools-ext/mpfb2/src")
    if mpfb_src not in sys.path:
        sys.path.insert(0, mpfb_src)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mpfb = importlib.import_module("mpfb")
    # O MPFB usa `__package__` para descobrir onde está; em módulo solto o pacote é "mpfb".
    mpfb.register()
    return mpfb


def dynamic_import(absolute_package_str: str, key: str):
    """Mesma quirk usada nos exemplos oficiais do MPFB."""
    for amod in list(sys.modules):
        if amod.endswith(absolute_package_str):
            mod = importlib.import_module(amod)
            if hasattr(mod, key):
                return getattr(mod, key)
    raise ValueError(f"No module found with name ending in {absolute_package_str}")
