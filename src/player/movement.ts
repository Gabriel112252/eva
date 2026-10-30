/**
 * Movimento de ação de Matias — lógica pura (sem Babylon), testada em `tests/unit/movement.test.ts`:
 * pulo com tempo de coiote e buffer, pulo duplo, esquiva rolando com recarga, impulso no ar, deslize ao
 * agachar correndo, embalo da corrida (andar → correr → embalo) e classificação da aterrissagem.
 * O `PlayerController` aplica as decisões desta máquina de estados à cápsula do Havok
 * (`PhysicsCharacterController`), que continua dona das colisões, degraus e rampas.
 *
 * Portado/adaptado do BJS Character Controller V2 (https://github.com/crazyramirez/BJS_Character_Controller_V2):
 * a máquina de estados de pulo/pulo duplo/rolamento/impulso no ar (`_keyDown`, `_jump`, `_doubleJump`,
 * `_roll`), o tempo de coiote e o buffer de pulo, a recarga de 1,1 s da esquiva, a curva de aceleração
 * `apexAccelRate` e a escala de tremida da aterrissagem. A física própria dele (corpo dinâmico e raios) foi
 * trocada pela nossa; os números foram reajustados para a escala e o ritmo do jogo.
 *
 * MIT License
 *
 * Copyright (c) 2026 crazyramirez (https://github.com/crazyramirez)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/** Números do movimento (m, s, m/s, m/s²). Decisão do criador (30/10/2026): Matias mais ágil que o cânone realista. */
export const MOVEMENT_TUNING = {
  /** velocidade vertical do pulo — ~1,3 m de altura com a gravidade de subida */
  jumpVelocity: 6.6,
  /** pulo duplo: redefine a velocidade vertical (soma ~1,1 m a partir de onde foi dado) */
  doubleJumpVelocity: 6.0,
  /** gravidade do personagem subindo / caindo (o mundo usa 9,81): arco firme, sem flutuar */
  riseGravity: 17,
  fallGravity: 27,
  maxFallSpeed: 24,
  /** depois de sair de uma borda andando, o pulo ainda conta como do chão por este tempo */
  coyoteTime: 0.12,
  /** pulo apertado um pouco antes de tocar o chão dispara na aterrissagem */
  jumpBuffer: 0.15,
  /** logo após o impulso a cápsula ainda toca o chão: o apoio é ignorado por este tempo */
  takeoffGrace: 0.1,
  /** controle no ar: aceleração horizontal e velocidade mínima com o direcional apertado */
  airAccel: 10,
  airMinSpeed: 2.6,
  /** esquiva (rolamento no chão / impulso no ar): recarga contada do início, como no controlador de referência */
  dodgeCooldown: 1.1,
  rollDuration: 0.55,
  rollSpeed: 6.8,
  /** fração do rolamento em velocidade cheia; o resto desacelera até a velocidade da locomoção */
  rollHold: 0.62,
  /** a partir desta fração do rolamento dá para emendar um pulo */
  rollJumpFrom: 0.5,
  airDashDuration: 0.2,
  airDashSpeed: 9.5,
  airDashLift: 1.2,
  airDashGravityScale: 0.2,
  /** deslize: velocidade mínima para entrar (correndo), ganho na entrada, atrito e fim */
  slideEnterSpeed: 4.2,
  slideBoost: 1.2,
  slideMaxSpeed: 8.2,
  slideFriction: 4.6,
  slideEndSpeed: 2.2,
  slideMaxTime: 1.15,
  /** curva máxima do deslize (rad/s) */
  slideSteer: 1.6,
  /** segundos de corrida contínua no plano até engatar o embalo */
  sprintAfter: 0.9,
  /** quedas menores que isto (degraus, meio-fio) não contam como aterrissagem */
  landMinDrop: 0.35,
  landHeavyDrop: 1.7,
  landHardDrop: 4.0,
} as const;

export type MovementTuning = { -readonly [K in keyof typeof MOVEMENT_TUNING]: number };

/** Raios de ruído (m) para a IA (`src/ai/stealth.ts` dá andar 9, correr 15, agachado 4). */
export const MOVEMENT_NOISE = {
  jump: 5,
  landSoft: 10,
  landHeavy: 14,
  landHard: 18,
  roll: 12,
  airDash: 7,
  slide: 7,
} as const;

/** Por quanto tempo (s) um ruído pontual (aterrissagem, rolamento) fica audível — a IA amostra 5×/s. */
export const NOISE_PULSE_TIME = 0.45;

export type MotionPhase = "ground" | "air" | "roll" | "airDash" | "slide";
export type LandingImpact = "soft" | "heavy" | "hard";
export type SlideEndReason = "slow" | "time" | "air" | "jump" | "cancel" | "roll";

export type MotionEvent =
  | { type: "jump"; double: boolean; fromSlide: boolean; fromRoll: boolean; coyote: boolean }
  | { type: "fall" }
  | { type: "land"; drop: number; airTime: number; impact: LandingImpact | null }
  | { type: "roll" }
  | { type: "rollEnd" }
  | { type: "airDash" }
  | { type: "airDashEnd" }
  | { type: "dodgeDenied"; reason: "cooldown" | "used" }
  | { type: "slideEnd"; reason: SlideEndReason };

export interface MotionSample {
  /** cápsula apoiada (checkSupport do Havok ou encaixe no chão) */
  grounded: boolean;
  /** altura dos pés (m) — mede a queda */
  y: number;
  /** velocidade vertical atual (m/s) */
  vy: number;
  /** sem controle (diálogo, menu, morte): pedidos são descartados */
  locked: boolean;
  /** dá para pular do chão agora (há espaço para ficar de pé quando agachado/deslizando) */
  canJump?: boolean;
  /** aceleração ao longo do deslize dada pela rampa (m/s², positiva descendo) */
  slopeAccel?: number;
}

/** Curva de aceleração do controlador de referência: arranque rápido parado, controle fino perto do alvo. */
export function apexAccelRate(baseRate: number, ratio: number): number {
  const r = Math.max(0, Math.min(1, ratio));
  return baseRate * (1 + 1.2 * (1 - r) * (1 - r));
}

/** Aproximação exponencial de `current` a `target` com taxa `rate` (1/s), independente do frame-rate. */
export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

/** Classe da aterrissagem pela altura da queda (pico do arco − apoio). */
export function classifyLanding(drop: number, t: MovementTuning = MOVEMENT_TUNING): LandingImpact | null {
  if (!(drop >= t.landMinDrop)) return null;
  if (drop < t.landHeavyDrop) return "soft";
  if (drop < t.landHardDrop) return "heavy";
  return "hard";
}

export function landingNoise(impact: LandingImpact | null): number {
  if (impact === "hard") return MOVEMENT_NOISE.landHard;
  if (impact === "heavy") return MOVEMENT_NOISE.landHeavy;
  if (impact === "soft") return MOVEMENT_NOISE.landSoft;
  return 0;
}

/** Intensidade (0–1) do tranco de câmera na aterrissagem (referência: 0,08 suave, 0,22 pesada). */
export function landingShake(impact: LandingImpact | null): number {
  if (impact === "hard") return 1;
  if (impact === "heavy") return 0.65;
  if (impact === "soft") return 0.32;
  return 0;
}

/** Velocidade (m/s) do rolamento no instante `t` (s): cheia na primeira parte, depois desacelera até `exitSpeed`. */
export function rollSpeedAt(t: number, exitSpeed: number, tune: MovementTuning = MOVEMENT_TUNING): number {
  const hold = tune.rollDuration * tune.rollHold;
  if (t <= hold) return tune.rollSpeed;
  const k = Math.min(1, (t - hold) / Math.max(1e-3, tune.rollDuration - hold));
  const ease = k * k * (3 - 2 * k);
  return tune.rollSpeed + (Math.max(0, exitSpeed) - tune.rollSpeed) * ease;
}

/**
 * Embalo da corrida: acumula tempo enquanto corre no plano; zera ao parar, agachar, mirar ou subir/descer
 * escada/rampa. Devolve o novo acumulado — engata quando passa de `sprintAfter`.
 */
export function sprintCharge(timer: number, dt: number, eligible: boolean): number {
  return eligible ? timer + dt : 0;
}

/**
 * Máquina de estados do movimento: recebe os pedidos (pular, esquivar, deslizar) e, a cada quadro, o apoio
 * da cápsula; devolve os eventos que o controlador transforma em velocidade, animação, câmera e ruído.
 */
export class MovementStateMachine {
  readonly tune: MovementTuning;
  phase: MotionPhase = "ground";
  /** segundos na fase atual */
  phaseTime = 0;
  /** segundos desde o último apoio */
  airTime = 0;
  doubleJumpUsed = false;
  airDashUsed = false;
  /** velocidade atual do deslize (m/s) */
  slideSpeed = 0;
  /** pico de altura dos pés no ar atual (para a queda) */
  private peakY = 0;
  private clock = 0;
  private dodgeReadyAt = 0;
  /** segundos desde o pedido de pulo (<0 = nenhum) */
  private jumpBufferT = -1;
  private dodgeQueued = false;

  constructor(tune: Partial<MovementTuning> = {}) {
    this.tune = { ...MOVEMENT_TUNING, ...tune };
  }

  /** No ar por pulo, queda ou impulso (o rolamento/deslize contam como chão). */
  get airborne(): boolean {
    return this.phase === "air" || this.phase === "airDash";
  }

  /** Segundos até a esquiva estar disponível de novo. */
  get dodgeCooldownLeft(): number {
    return Math.max(0, this.dodgeReadyAt - this.clock);
  }

  get jumpPending(): boolean {
    return this.jumpBufferT >= 0;
  }

  requestJump(): void {
    this.jumpBufferT = 0;
  }

  requestDodge(): void {
    this.dodgeQueued = true;
  }

  /** Agachar correndo: entra no deslize se estiver no chão rápido o bastante. */
  tryStartSlide(speed: number, grounded: boolean): boolean {
    if (this.phase !== "ground" || !grounded || speed < this.tune.slideEnterSpeed) return false;
    this.setPhase("slide");
    this.slideSpeed = Math.min(this.tune.slideMaxSpeed, speed * this.tune.slideBoost);
    return true;
  }

  /** Levantar no meio do deslize (soltou Ctrl / apertou C). */
  cancelSlide(): boolean {
    if (this.phase !== "slide") return false;
    this.setPhase("ground");
    return true;
  }

  /** Teleporte, veículo, carregamento: volta ao chão sem eventos e sem pedidos pendentes. */
  reset(y = 0): void {
    this.setPhase("ground");
    this.airTime = 0;
    this.doubleJumpUsed = false;
    this.airDashUsed = false;
    this.slideSpeed = 0;
    this.peakY = y;
    this.jumpBufferT = -1;
    this.dodgeQueued = false;
  }

  private setPhase(p: MotionPhase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  update(dt: number, s: MotionSample): MotionEvent[] {
    const t = this.tune;
    const ev: MotionEvent[] = [];
    this.clock += dt;
    this.phaseTime += dt;
    // no começo do arco a cápsula ainda encosta no chão; subindo, um apoio é só de raspão numa borda
    const grounded = s.grounded && !(this.airborne && (this.phaseTime < t.takeoffGrace || s.vy > 0.5));

    if (grounded) {
      if (this.airborne) {
        const drop = Math.max(0, this.peakY - s.y);
        if (this.phase === "airDash") ev.push({ type: "airDashEnd" });
        ev.push({ type: "land", drop, airTime: this.airTime, impact: classifyLanding(drop, t) });
        this.setPhase("ground");
      }
      this.airTime = 0;
      this.doubleJumpUsed = false;
      this.airDashUsed = false;
      this.peakY = s.y;
    } else {
      this.airTime += dt;
      this.peakY = Math.max(this.peakY, s.y);
      if (this.airTime > t.coyoteTime) {
        if (this.phase === "ground") {
          this.setPhase("air");
          ev.push({ type: "fall" });
        } else if (this.phase === "slide") {
          ev.push({ type: "slideEnd", reason: "air" });
          this.setPhase("air");
          ev.push({ type: "fall" });
        }
      }
    }

    // fases com duração
    if (this.phase === "roll" && this.phaseTime >= t.rollDuration) {
      ev.push({ type: "rollEnd" });
      this.setPhase(grounded || this.airTime <= t.coyoteTime ? "ground" : "air");
    } else if (this.phase === "airDash" && this.phaseTime >= t.airDashDuration) {
      ev.push({ type: "airDashEnd" });
      this.setPhase("air");
    } else if (this.phase === "slide") {
      if (grounded) this.slideSpeed += ((s.slopeAccel ?? 0) - t.slideFriction) * dt;
      this.slideSpeed = Math.max(0, Math.min(t.slideMaxSpeed, this.slideSpeed));
      const downhill = (s.slopeAccel ?? 0) > t.slideFriction * 0.5;
      if (this.slideSpeed <= t.slideEndSpeed) {
        ev.push({ type: "slideEnd", reason: "slow" });
        this.setPhase("ground");
      } else if (this.phaseTime >= t.slideMaxTime && !downhill) {
        ev.push({ type: "slideEnd", reason: "time" });
        this.setPhase("ground");
      }
    }

    if (s.locked) {
      this.jumpBufferT = -1;
      this.dodgeQueued = false;
      return ev;
    }

    // esquiva: rolamento no chão, impulso no ar (uma vez por salto), recarga comum
    if (this.dodgeQueued) {
      this.dodgeQueued = false;
      if (this.phase === "roll" || this.phase === "airDash") {
        // já esquivando: ignora
      } else if (this.clock < this.dodgeReadyAt) {
        ev.push({ type: "dodgeDenied", reason: "cooldown" });
      } else if (this.phase === "ground" || this.phase === "slide") {
        if (this.phase === "slide") ev.push({ type: "slideEnd", reason: "roll" });
        this.setPhase("roll");
        this.dodgeReadyAt = this.clock + t.dodgeCooldown;
        ev.push({ type: "roll" });
      } else if (this.airDashUsed) {
        ev.push({ type: "dodgeDenied", reason: "used" });
      } else {
        this.airDashUsed = true;
        this.setPhase("airDash");
        this.dodgeReadyAt = this.clock + t.dodgeCooldown;
        ev.push({ type: "airDash" });
      }
    }

    // pulo: do chão (com coiote), emendado no deslize/fim do rolamento, ou duplo no ar
    if (this.jumpBufferT >= 0) {
      const onGround = grounded || this.airTime <= t.coyoteTime;
      const canGround = s.canJump !== false && onGround;
      const fromRoll = this.phase === "roll" && this.phaseTime >= t.rollDuration * t.rollJumpFrom;
      if (canGround && (this.phase === "ground" || this.phase === "slide" || fromRoll)) {
        const fromSlide = this.phase === "slide";
        if (fromSlide) ev.push({ type: "slideEnd", reason: "jump" });
        if (fromRoll) ev.push({ type: "rollEnd" });
        ev.push({ type: "jump", double: false, fromSlide, fromRoll, coyote: !grounded });
        this.setPhase("air");
        this.peakY = s.y;
        this.airTime = Math.max(this.airTime, 1e-3);
        this.jumpBufferT = -1;
      } else if (this.airborne && !this.doubleJumpUsed && !onGround) {
        if (this.phase === "airDash") ev.push({ type: "airDashEnd" });
        this.doubleJumpUsed = true;
        ev.push({ type: "jump", double: true, fromSlide: false, fromRoll: false, coyote: false });
        this.setPhase("air");
        this.jumpBufferT = -1;
      } else {
        this.jumpBufferT += dt;
        if (this.jumpBufferT > t.jumpBuffer) this.jumpBufferT = -1;
      }
    }
    return ev;
  }
}
