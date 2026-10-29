import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Engine } from "@babylonjs/core/Engines/engine";
import type { Scene } from "@babylonjs/core/scene";
import type { QualityLevel } from "@/core/settings";

interface Tracer {
  mesh: Mesh;
  life: number;
}

/**
 * Efeitos de combate baratos: clarão de boca (luz pontual + sprite aditivo com alfa radial e raios +
 * 2–3 partículas de fumaça), traçantes (linhas finas que somem em ~80 ms), faíscas/poeira de impacto
 * (partículas) e sangue estilizado discreto (pó escuro). `setQuality("baixa")` reduz as contagens.
 */
export class CombatEffects {
  private tracers: Tracer[] = [];
  private tracerMat: StandardMaterial;
  private flashLight: PointLight;
  private flashLife = 0;
  private flashMesh: Mesh;
  private flashMat: StandardMaterial;
  private sparks: ParticleSystem;
  private dust: ParticleSystem;
  private smoke: ParticleSystem;
  private blood: ParticleSystem;
  private quality: QualityLevel = "media";

  constructor(private readonly scene: Scene) {
    this.tracerMat = new StandardMaterial("fx_tracer", scene);
    this.tracerMat.emissiveColor = new Color3(1.0, 0.85, 0.55);
    this.tracerMat.disableLighting = true;
    this.tracerMat.alpha = 0.85;

    this.flashLight = new PointLight("fx_flash", Vector3.Zero(), scene);
    this.flashLight.diffuse = new Color3(1.0, 0.75, 0.4);
    this.flashLight.intensity = 14;
    this.flashLight.range = 9;
    this.flashLight.setEnabled(false);

    // sprite do clarão: núcleo branco-amarelo com alfa radial e raios, somado à cena (aditivo)
    const flashTex = this.makeFlashTexture();
    this.flashMat = new StandardMaterial("fx_flash_mat", scene);
    this.flashMat.diffuseTexture = flashTex;
    this.flashMat.emissiveTexture = flashTex;
    this.flashMat.opacityTexture = flashTex;
    this.flashMat.emissiveColor = new Color3(1, 1, 1);
    this.flashMat.diffuseColor = new Color3(0, 0, 0);
    this.flashMat.disableLighting = true;
    this.flashMat.backFaceCulling = false;
    this.flashMat.alphaMode = Engine.ALPHA_ADD;
    this.flashMesh = MeshBuilder.CreatePlane("fx_flash_plane", { size: 0.42 }, scene);
    this.flashMesh.material = this.flashMat;
    this.flashMesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
    this.flashMesh.isPickable = false;
    this.flashMesh.isVisible = false;
    this.flashMesh.renderingGroupId = 0;

    const tex = this.makeSpotTexture();
    this.sparks = this.makeParticles("fx_sparks", tex, new Color4(1, 0.8, 0.4, 1), new Color4(1, 0.4, 0.1, 0), 0.03, 0.07, 5, 9, 0.25, 0.5);
    this.dust = this.makeParticles("fx_dust", tex, new Color4(0.62, 0.56, 0.48, 0.55), new Color4(0.5, 0.45, 0.4, 0), 0.16, 0.38, 0.5, 1.4, 0.6, 1.1);
    this.dust.gravity = new Vector3(0, -1.2, 0);
    this.dust.addSizeGradient(0, 0.6);
    this.dust.addSizeGradient(1, 1.8);
    this.smoke = this.makeParticles("fx_smoke", tex, new Color4(0.75, 0.72, 0.68, 0.38), new Color4(0.6, 0.6, 0.6, 0), 0.08, 0.14, 0.4, 0.9, 0.45, 0.9);
    this.smoke.gravity = new Vector3(0, 0.6, 0);
    this.smoke.addSizeGradient(0, 0.5);
    this.smoke.addSizeGradient(1, 2.6);
    this.smoke.minAngularSpeed = -1.5;
    this.smoke.maxAngularSpeed = 1.5;
    this.blood = this.makeParticles("fx_blood", tex, new Color4(0.35, 0.05, 0.03, 0.9), new Color4(0.2, 0.02, 0.02, 0), 0.05, 0.12, 1.2, 2.6, 0.3, 0.6);
  }

  setQuality(q: QualityLevel): void {
    this.quality = q;
  }

  private get low(): boolean {
    return this.quality === "baixa";
  }

  private makeSpotTexture(): Texture {
    const size = 32;
    const dt = new DynamicTexture("fx_spot", { width: size, height: size }, this.scene, false);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.5, "rgba(255,255,255,0.5)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    dt.update();
    dt.hasAlpha = true;
    return dt;
  }

  /** Clarão: gradiente radial (branco → laranja → transparente) com 6 raios irregulares. */
  private makeFlashTexture(): Texture {
    const size = 64;
    const dt = new DynamicTexture("fx_flash_tex", { width: size, height: size }, this.scene, true);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    const c = size / 2;
    ctx.clearRect(0, 0, size, size);
    // raios
    ctx.save();
    ctx.translate(c, c);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + (i % 2) * 0.2;
      const len = c * (i % 2 ? 0.95 : 0.7);
      const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      g.addColorStop(0, "rgba(255,210,120,0.9)");
      g.addColorStop(1, "rgba(255,140,40,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a + 0.12) * 4, Math.sin(a + 0.12) * 4);
      ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      ctx.lineTo(Math.cos(a - 0.12) * 4, Math.sin(a - 0.12) * 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // núcleo
    const core = ctx.createRadialGradient(c, c, 0, c, c, c * 0.55);
    core.addColorStop(0, "rgba(255,255,240,1)");
    core.addColorStop(0.35, "rgba(255,225,150,0.95)");
    core.addColorStop(0.7, "rgba(255,150,60,0.45)");
    core.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = core;
    ctx.fillRect(0, 0, size, size);
    dt.update();
    dt.hasAlpha = true;
    return dt;
  }

  private makeParticles(name: string, tex: Texture, c1: Color4, c2: Color4, minSize: number, maxSize: number, minPow: number, maxPow: number, minLife: number, maxLife: number): ParticleSystem {
    const ps = new ParticleSystem(name, 200, this.scene);
    ps.particleTexture = tex;
    ps.emitter = new Vector3(0, -100, 0);
    ps.minEmitBox = new Vector3(-0.02, -0.02, -0.02);
    ps.maxEmitBox = new Vector3(0.02, 0.02, 0.02);
    ps.color1 = c1;
    ps.color2 = c1;
    ps.colorDead = c2;
    ps.minSize = minSize;
    ps.maxSize = maxSize;
    ps.minLifeTime = minLife;
    ps.maxLifeTime = maxLife;
    ps.emitRate = 0;
    ps.manualEmitCount = 0;
    ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    ps.gravity = new Vector3(0, -6, 0);
    ps.minEmitPower = minPow;
    ps.maxEmitPower = maxPow;
    ps.updateSpeed = 0.016;
    ps.start();
    return ps;
  }

  /** Clarão na boca do cano (+ fumaça). `direction` (opcional) empurra a fumaça para a frente do cano. */
  muzzleFlash(position: Vector3, direction?: Vector3): void {
    this.flashLight.position.copyFrom(position);
    this.flashLight.setEnabled(true);
    this.flashLight.intensity = 12 + Math.random() * 6;
    this.flashMesh.position.copyFrom(position);
    this.flashMesh.isVisible = true;
    this.flashMesh.rotation.z = Math.random() * Math.PI;
    this.flashMesh.scaling.setAll(0.85 + Math.random() * 0.5);
    this.flashLife = 0.06;
    const dir = direction ? direction.normalizeToNew() : new Vector3(0, 1, 0);
    (this.smoke.emitter as Vector3).copyFrom(position.add(dir.scale(0.08)));
    this.smoke.direction1 = dir.scale(0.6).add(new Vector3(-0.25, 0.2, -0.25));
    this.smoke.direction2 = dir.scale(1.0).add(new Vector3(0.25, 0.5, 0.25));
    this.smoke.manualEmitCount = this.low ? 2 : 3;
  }

  /** Traçante entre a boca do cano e o ponto de impacto. */
  tracer(from: Vector3, to: Vector3): void {
    const dir = to.subtract(from);
    const len = dir.length();
    if (len < 0.3) return;
    const mesh = MeshBuilder.CreateCylinder("fx_tracer_" + this.tracers.length, { height: len, diameter: 0.018, tessellation: 4 }, this.scene);
    mesh.material = this.tracerMat;
    mesh.isPickable = false;
    mesh.position.copyFrom(from.add(to).scaleInPlace(0.5));
    const up = new Vector3(0, 1, 0);
    const d = dir.normalize();
    const axis = Vector3.Cross(up, d);
    const angle = Math.acos(Math.max(-1, Math.min(1, Vector3.Dot(up, d))));
    if (axis.lengthSquared() > 1e-6) mesh.rotate(axis.normalize(), angle);
    this.tracers.push({ mesh, life: 0.08 });
  }

  /** Impacto em superfície: faíscas/lascas + nuvem de poeira, orientadas pela normal. */
  impact(position: Vector3, normal: Vector3, metal = false): void {
    (this.sparks.emitter as Vector3).copyFrom(position.add(normal.scale(0.02)));
    this.sparks.direction1 = normal.add(new Vector3(-0.6, -0.6, -0.6));
    this.sparks.direction2 = normal.add(new Vector3(0.6, 0.6, 0.6));
    this.sparks.manualEmitCount = this.low ? (metal ? 8 : 4) : metal ? 14 : 7;
    (this.dust.emitter as Vector3).copyFrom(position.add(normal.scale(0.05)));
    this.dust.direction1 = normal.add(new Vector3(-0.5, 0.1, -0.5));
    this.dust.direction2 = normal.add(new Vector3(0.5, 0.7, 0.5));
    this.dust.manualEmitCount = this.low ? 4 : metal ? 5 : 9;
  }

  /** Acerto em pessoa: borrifo escuro discreto (sem gore). */
  flesh(position: Vector3, dir: Vector3): void {
    (this.blood.emitter as Vector3).copyFrom(position);
    this.blood.direction1 = dir.scale(0.8).add(new Vector3(-0.4, 0.2, -0.4));
    this.blood.direction2 = dir.scale(1.2).add(new Vector3(0.4, 0.8, 0.4));
    this.blood.manualEmitCount = this.low ? 6 : 10;
  }

  update(dt: number): void {
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      // o sprite encolhe/apaga ao longo da vida curta
      const k = Math.max(0, this.flashLife / 0.06);
      this.flashMat.alpha = 0.35 + 0.65 * k;
      if (this.flashLife <= 0) {
        this.flashLight.setEnabled(false);
        this.flashMesh.isVisible = false;
        this.flashMat.alpha = 1;
      }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i]!;
      t.life -= dt;
      if (t.life <= 0) {
        t.mesh.dispose();
        this.tracers.splice(i, 1);
      }
    }
  }
}
