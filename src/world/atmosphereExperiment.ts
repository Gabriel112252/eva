import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { QualityLevel } from "@/core/settings";
import type { MaterialLibrary } from "./materials";
import type { Environment } from "./environment";
import { WORKSHOP } from "./workshop";

/**
 * EVA — experimento opt-in de atmosfera e chuva, inspirado nos sistemas
 * weather.js / rainFX.js de Dark Strands, © Victor Zakharov, 2026, MIT.
 * Código adaptado/reescrito para Babylon 9 modular e para São Paulo Velha.
 * Licença/atribuição: docs/EXPERIMENTO_DARK_STRANDS.md.
 *
 * Não altera a gameplay, scripts de história, iluminação de diálogos, nem
 * expõe configurações persistidas. Ativar por ?atmosfera=nublado|chuva.
 */
export type AtmosphereMode = "off" | "nublado" | "chuva";

export function getAtmosphereMode(search: string): AtmosphereMode {
  const value = new URLSearchParams(search).get("atmosfera");
  return value === "nublado" || value === "chuva" ? value : "off";
}

export function isMatiasInsideWorkshop(x: number, y: number, z: number): boolean {
  return x >= WORKSHOP.x0 && x <= WORKSHOP.x1 &&
    z >= WORKSHOP.zBack && z <= WORKSHOP.zFront &&
    y < WORKSHOP.height - 0.2;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class AtmosphereExperiment {
  readonly mode: Exclude<AtmosphereMode, "off">;
  readonly particles: ParticleSystem | null;
  private readonly texture: DynamicTexture | null;
  private readonly sunBase: number;
  private readonly skyBase: number;
  private readonly fogBase: number;
  private readonly fogColorBase: Color3;
  private readonly clearBase: Color4;
  private readonly asphaltBase: number;
  private readonly sidewalkBase: number;
  private readonly bufferPosition = Vector3.Zero();

  constructor(
    private readonly scene: Scene,
    private readonly environment: Environment,
    private readonly mats: MaterialLibrary,
    readonly quality: QualityLevel,
    mode: Exclude<AtmosphereMode, "off">,
  ) {
    this.mode = mode;
    this.sunBase = environment.sun.intensity;
    this.skyBase = environment.sky.intensity;
    this.fogBase = scene.fogDensity;
    this.fogColorBase = scene.fogColor.clone();
    this.clearBase = scene.clearColor.clone();
    this.asphaltBase = mats.asphalt.roughness;
    this.sidewalkBase = mats.sidewalk.roughness;

    // Constantes de cena. A luz permanece estável durante diálogos e gravações.
    // Não adiciona um segundo relógio/clima concorrendo com Environment.
    environment.sun.intensity *= mode === "chuva" ? 0.46 : 0.64;
    environment.sky.intensity *= mode === "chuva" ? 0.78 : 0.88;
    scene.fogDensity = mode === "chuva" ? 0.013 : 0.0105;
    scene.fogColor = mode === "chuva"
      ? new Color3(0.52, 0.58, 0.61)
      : new Color3(0.65, 0.67, 0.67);
    scene.clearColor = mode === "chuva"
      ? new Color4(0.40, 0.47, 0.52, 1)
      : new Color4(0.57, 0.63, 0.67, 1);

    if (mode === "chuva") {
      // O material original está congelado por otimização em WorldBuilder.
      // Alterar roughness somente neste ramo opt-in; voltar a congelar logo.
      mats.asphalt.unfreeze();
      mats.asphalt.roughness = 0.55;
      mats.asphalt.freeze();
      mats.sidewalk.unfreeze();
      mats.sidewalk.roughness = 0.69;
      mats.sidewalk.freeze();
      this.texture = new DynamicTexture("eva_chuva_textura", { width: 16, height: 64 }, scene, false);
      const ctx = this.texture.getContext();
      ctx.clearRect(0, 0, 16, 64);
      const grad = ctx.createLinearGradient(0, 0, 0, 64);
      grad.addColorStop(0, "rgba(190,205,222,0)");
      grad.addColorStop(0.38, "rgba(205,220,237,0.74)");
      grad.addColorStop(0.66, "rgba(224,232,242,0.75)");
      grad.addColorStop(1, "rgba(206,217,237,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(6, 0, 4, 64);
      this.texture.hasAlpha = true;
      this.texture.update();

      const capacity = quality === "baixa" ? 350 : quality === "media" ? 850 : 1450;
      const rain = new ParticleSystem("eva_chuva_experimento", capacity, scene);
      rain.particleTexture = this.texture;
      rain.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      rain.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
      rain.emitter = this.bufferPosition;
      rain.minEmitBox = new Vector3(-8, 0, -8);
      rain.maxEmitBox = new Vector3(8, 1.5, 8);
      rain.direction1 = new Vector3(-0.13, -1, 0);
      rain.direction2 = new Vector3(0.07, -1, 0.07);
      rain.minEmitPower = 16;
      rain.maxEmitPower = 20;
      rain.minLifeTime = 0.45;
      rain.maxLifeTime = 0.7;
      rain.minSize = 0.12;
      rain.maxSize = 0.20;
      rain.minScaleX = 0.04;
      rain.maxScaleX = 0.07;
      rain.minScaleY = 0.75;
      rain.maxScaleY = 1.15;
      rain.color1 = new Color4(0.72, 0.82, 0.90, 0.40);
      rain.color2 = new Color4(0.85, 0.88, 0.93, 0.30);
      rain.colorDead = new Color4(0.65, 0.73, 0.80, 0);
      rain.updateSpeed = 1 / 60;
      rain.emitRate = 0;
      rain.start();
      this.particles = rain;
    } else {
      this.texture = null;
      this.particles = null;
    }
  }

  /** Atualizar a precipitação apenas com o jogador ao ar livre e jogando. */
  update(feet: Vector3, isPlaying: boolean): void {
    if (!this.particles) return;
    const inside = isMatiasInsideWorkshop(feet.x, feet.y, feet.z);
    this.particles.emitRate = isPlaying && !inside
      ? this.quality === "baixa" ? 250 : this.quality === "media" ? 560 : 850
      : 0;
    this.bufferPosition.set(feet.x, feet.y + 10, feet.z);
  }

  dispose(): void {
    this.particles?.dispose();
    this.texture?.dispose();
    this.environment.sun.intensity = this.sunBase;
    this.environment.sky.intensity = this.skyBase;
    this.scene.fogDensity = this.fogBase;
    this.scene.fogColor = this.fogColorBase;
    this.scene.clearColor = this.clearBase;
    this.mats.asphalt.unfreeze();
    this.mats.asphalt.roughness = this.asphaltBase;
    this.mats.asphalt.freeze();
    this.mats.sidewalk.unfreeze();
    this.mats.sidewalk.roughness = this.sidewalkBase;
    this.mats.sidewalk.freeze();
  }
}
