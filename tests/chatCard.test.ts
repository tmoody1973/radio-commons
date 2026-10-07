import { describe, expect, it } from "vitest";
import { chatCardPage, storyCardPage } from "@/lib/card";

// The ChatGPT door's card page (approved mockups, 2026-10-07). Alexa's page is pinned by tests/alexaDoor.test.ts.
describe("chat card page", () => {
  const page = chatCardPage("k");

  it("uses the system font, no Figtree or Google Fonts", () => {
    expect(page).not.toContain("fonts.googleapis.com");
    expect(page).toContain("ui-sans-serif, -apple-system, system-ui");
  });

  it("fits its content: no zoom, no viewport-height minimum", () => {
    expect(page).toContain("const z = 1;");
    expect(page).toContain("#root{min-height:0;display:block}");
  });

  it("hides the logo (ChatGPT shows the app name itself)", () => {
    expect(page).toContain(".logo{display:none}");
  });

  it("still reads card HTML from _meta", () => {
    expect(page).toContain("...result._meta");
  });

  it("leaves the Alexa page alone", () => {
    const alexa = storyCardPage("k");
    expect(alexa).toContain("fonts.googleapis.com");
    expect(alexa).toContain("const z = width / 768;");
  });
});
