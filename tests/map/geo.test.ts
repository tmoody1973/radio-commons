import { describe, expect, it } from "vitest";
import { clusterPins, mapFrame, pinPositions, TILE } from "@/lib/map/geo";

const TEDS = { lat: 43.06087, lng: -87.98998 };
const BREAD = { lat: 42.94801, lng: -87.9484 };
const HIGH_STAKES = { lat: 43.04407, lng: -87.91024 };

describe("mapFrame", () => {
  it("centers between the places and zooms so they fit inside the padding", () => {
    const frame = mapFrame([TEDS, BREAD], 300, 260);
    const [a, b] = pinPositions([TEDS, BREAD], frame, 300, 260);
    for (const p of [a, b]) {
      expect(p.x).toBeGreaterThanOrEqual(30);
      expect(p.x).toBeLessThanOrEqual(270);
      expect(p.y).toBeGreaterThanOrEqual(30);
      expect(p.y).toBeLessThanOrEqual(230);
    }
    // At least one place touches the padded edge: the map isn't zoomed out further than it needs to be.
    expect(Math.min(a.y, b.y)).toBeLessThan(32);
  });
  it("caps the zoom for a single place", () => {
    expect(mapFrame([TEDS], 300, 260).zoom).toBe(15);
  });
});

describe("pinPositions", () => {
  it("puts the center at the image center, and one tile east at zoom z 512 px right", () => {
    const frame = { center: { lat: 43, lng: -88 }, zoom: 3 };
    expect(pinPositions([frame.center], frame, 400, 300)[0]).toEqual({ x: 200, y: 150 });
    const oneTileEast = { lat: 43, lng: -88 + 360 / 2 ** 3 };
    expect(pinPositions([oneTileEast], frame, 400, 300)[0].x).toBeCloseTo(200 + TILE, 6);
  });
});

describe("clusterPins", () => {
  it("one badge for places at the same address, separate badges when far apart", () => {
    const pins = [{ x: 10, y: 10 }, { x: 200, y: 200 }, { x: 12, y: 11 }];
    expect(clusterPins(pins)).toEqual([
      { label: "2 places", numbers: [1, 3], x: 10, y: 10 },
      { label: "2", numbers: [2], x: 200, y: 200 },
    ]);
    expect(clusterPins([{ x: 0, y: 0 }, { x: 36, y: 0 }])).toHaveLength(2);
  });
});
