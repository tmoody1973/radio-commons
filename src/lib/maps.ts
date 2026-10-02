const MAPS_DIRECTIONS = "https://www.google.com/maps/dir/?api=1&destination=";

/** "Ted's…, 6204 W North Ave, Milwaukee, WI 53213-1532, United States" → "6204 W North Ave" (the part worth saying aloud). */
export function streetAddress(label: string | null | undefined, placeName?: string): string | null {
  return label?.split(",").map((part) => part.trim()).find((part) => part !== placeName && /^\d/.test(part)) ?? null;
}

/** A Google Maps directions link: by name and address when we have one (better than bare coordinates), else the pin. */
export function directionsUrl(name: string, address: string | null | undefined, lat: number, lng: number): string {
  const parts = address?.split(",").map((p) => p.trim()).filter((p) => p && p !== "United States") ?? [];
  if (parts.length > 0 && parts[0] !== name) parts.unshift(name);
  const destination = parts.length > 1 ? parts.join(", ") : `${lat},${lng}`;
  return `${MAPS_DIRECTIONS}${encodeURIComponent(destination)}`;
}

/** What the simulator host will open for the card: Google Maps links only. */
export function isMapsLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "www.google.com" && parsed.pathname.startsWith("/maps");
  } catch {
    return false;
  }
}
