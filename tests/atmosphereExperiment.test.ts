import { describe, expect, it } from "vitest";
import { getAtmosphereMode, isMatiasInsideWorkshop } from "../src/world/atmosphereExperiment";

describe("Experimento opcional de atmosfera", () => {
  it("fica desligado por padrão", () => {
    expect(getAtmosphereMode("")).toBe("off");
    expect(getAtmosphereMode("?quality=alta")).toBe("off");
    expect(getAtmosphereMode("?atmosfera=off")).toBe("off");
    expect(getAtmosphereMode("?atmosfera=desconhecido")).toBe("off");
  });

  it("só aceita presets conhecidos e mantém outros parâmetros", () => {
    expect(getAtmosphereMode("?pointerlock=0&atmosfera=chuva&quality=alta")).toBe("chuva");
    expect(getAtmosphereMode("?atmosfera=nublado")).toBe("nublado");
    expect(getAtmosphereMode("?atmosfera=CHUVA")).toBe("off");
  });

  it("não emite chuva dentro da oficina, mas emite na rua", () => {
    expect(isMatiasInsideWorkshop(-30, 0.2, -11)).toBe(true);
    expect(isMatiasInsideWorkshop(-30, 3.4, -11)).toBe(false);
    expect(isMatiasInsideWorkshop(-30, 0.2, -5)).toBe(false);
    expect(isMatiasInsideWorkshop(28, 0.12, -7)).toBe(false);
  });
});
