import { describe, expect, it } from "vitest";
import { directionsUrl, isMapsLink, isOpenableLink, streetAddress } from "@/lib/maps";

describe("maps helpers", () => {
  it("speaks just the street from the map service's full label", () => {
    expect(streetAddress("Ted's Ice Cream & Restaurant, 6204 W North Ave, Milwaukee, WI 53213-1532, United States")).toBe("6204 W North Ave");
    expect(streetAddress("8004 W National Ave, Milwaukee, WI 53214-4554, United States")).toBe("8004 W National Ave");
    expect(streetAddress(null)).toBeNull();
    expect(streetAddress("Milwaukee, WI, United States")).toBeNull(); // no street number: nothing useful to say
    // A business whose name starts with a number isn't its street.
    expect(streetAddress("414 Art Revival, 8004 W National Ave, Milwaukee, WI 53214, United States", "414 Art Revival")).toBe("8004 W National Ave");
  });
  it("builds a Google Maps directions link from the name and address", () => {
    expect(directionsUrl("Bread House", "Bread House, 5326 S 27th St, Milwaukee, WI 53221-3724, United States", 42.95, -87.95))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=Bread%20House%2C%205326%20S%2027th%20St%2C%20Milwaukee%2C%20WI%2053221-3724");
    expect(directionsUrl("Somewhere", null, 43.01, -88.01)).toBe("https://www.google.com/maps/dir/?api=1&destination=43.01%2C-88.01");
  });
  it("the host opens only Google Maps links", () => {
    expect(isMapsLink("https://www.google.com/maps/dir/?api=1&destination=x")).toBe(true);
    expect(isMapsLink("https://evil.example/maps")).toBe(false);
    expect(isMapsLink("javascript:alert(1)")).toBe(false);
    expect(isMapsLink("not a url")).toBe(false);
  });
  it("the host also opens Google Calendar and Field Guide event pages, nothing else", () => {
    expect(isOpenableLink("https://calendar.google.com/calendar/render?action=TEMPLATE&text=x")).toBe(true);
    expect(isOpenableLink("https://mke-field-guide.vercel.app/events/jazz-jam")).toBe(true);
    expect(isOpenableLink("https://www.google.com/maps/dir/?api=1&destination=x")).toBe(true);
    expect(isOpenableLink("https://evil.example/calendar")).toBe(false);
    expect(isOpenableLink("https://mke-field-guide.vercel.app.evil.example/x")).toBe(false);
    expect(isOpenableLink("javascript:alert(1)")).toBe(false);
  });
});

