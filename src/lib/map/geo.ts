/** Web Mercator on 512-px tiles (MapLibre's convention, which Amazon Location's v2 maps follow). */
export const TILE = 512;
const MAX_ZOOM = 15;

export interface LatLng { lat: number; lng: number }
export interface Frame { center: LatLng; zoom: number }
export interface Point { x: number; y: number }

const worldX = (lng: number) => ((lng + 180) / 360) * TILE;
const worldY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE;
};
const lngOf = (x: number) => (x / TILE) * 360 - 180;
const latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / TILE))) * 180) / Math.PI;

/** The center and zoom that fit every place inside a w×h image with `pad` px to spare. */
export function mapFrame(points: LatLng[], w: number, h: number, pad = 30): Frame {
  const xs = points.map((p) => worldX(p.lng));
  const ys = points.map((p) => worldY(p.lat));
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const fit = Math.min((w - 2 * pad) / Math.max(maxX - minX, 1e-9), (h - 2 * pad) / Math.max(maxY - minY, 1e-9));
  const zoom = Math.min(MAX_ZOOM, Math.floor(Math.log2(fit) * 100) / 100);
  return { center: { lat: latOf((minY + maxY) / 2), lng: lngOf((minX + maxX) / 2) }, zoom };
}

/** Where each place lands on a w×h image of `frame`. */
export function pinPositions(points: LatLng[], frame: Frame, w: number, h: number): Point[] {
  const scale = 2 ** frame.zoom;
  const cx = worldX(frame.center.lng);
  const cy = worldY(frame.center.lat);
  return points.map((p) => ({ x: (worldX(p.lng) - cx) * scale + w / 2, y: (worldY(p.lat) - cy) * scale + h / 2 }));
}

export interface Badge extends Point { label: string; numbers: number[] }

/**
 * One badge per place, numbered from 1 in list order; places closer than `minDistance` px share a badge
 * ("2 places") so overlapping pins stay readable from across the room.
 */
export function clusterPins(pins: Point[], minDistance = 36): Badge[] {
  const badges: Badge[] = [];
  pins.forEach((pin, i) => {
    const near = badges.find((b) => Math.hypot(b.x - pin.x, b.y - pin.y) < minDistance);
    if (near) near.numbers.push(i + 1);
    else badges.push({ x: pin.x, y: pin.y, numbers: [i + 1], label: "" });
  });
  return badges.map((b) => ({ label: b.numbers.length === 1 ? String(b.numbers[0]) : `${b.numbers.length} places`, numbers: b.numbers, x: b.x, y: b.y }));
}

/** The south-west and north-east corners of a w×h image of `frame`: the exact area the pins are placed on. */
export function frameBounds(frame: Frame, w: number, h: number): { sw: LatLng; ne: LatLng } {
  const scale = 2 ** frame.zoom;
  const cx = worldX(frame.center.lng);
  const cy = worldY(frame.center.lat);
  const at = (dx: number, dy: number) => ({ lat: latOf(cy + dy / scale), lng: lngOf(cx + dx / scale) });
  return { sw: at(-w / 2, h / 2), ne: at(w / 2, -h / 2) };
}
