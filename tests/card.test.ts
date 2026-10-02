import { describe, expect, it } from "vitest";
import type { Story } from "@/lib/backstory";
import { renderCard, storyCardPage } from "@/lib/card";

const STORY: Story = {
  storyId: "s1", show: "Uniquely Milwaukee", title: "Art & <script>alert(1)</script> \"Revival\"", summary: "Shop <b>bold</b>.",
  publishedAt: Date.UTC(2026, 8, 18, 15), attribution: "Uniquely Milwaukee, September 2026", audioUrl: "https://dovetail.prxu.org/a.mp3",
  permalink: null, imageUrl: "https://f.prxu.org/um.jpg", mentions: [], topics: [],
  places: [{ name: "414 Art Revival", category: "venue", lat: 43, lng: -88, neighborhood: "West Allis", quote: "q" }],
  actions: [{ kind: "visit", label: "Visit 414 Art Revival", quote: "q", place: "414 Art Revival" }],
};

describe("story card", () => {
  it("escapes story text in the card", () => {
    const html = renderCard(STORY);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("Art &amp; &lt;script&gt;alert(1)&lt;/script&gt; &quot;Revival&quot;");
    expect(html).toContain("Shop &lt;b&gt;bold&lt;/b&gt;.");
  });
  it("shows image, source line, places, actions and a play button", () => {
    const html = renderCard(STORY);
    expect(html).toContain('src="https://f.prxu.org/um.jpg"');
    expect(html).toContain("Uniquely Milwaukee · September 2026");
    expect(html).toContain("414 Art Revival · West Allis");
    expect(html).toContain("Visit 414 Art Revival");
    expect(html).toContain('data-audio="https://dovetail.prxu.org/a.mp3"');
  });
  it("card hides empty sections and a missing image", () => {
    const html = renderCard({ ...STORY, imageUrl: null, places: [], actions: [] });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("Places");
    expect(html).not.toContain("Things to do");
  });
  it("the page inlines the MCP Apps bundle, binds App, and renders structuredContent.cardHtml", () => {
    const page = storyCardPage();
    expect(page.startsWith("<!doctype html>")).toBe(true);
    expect(page).toMatch(/const App = [A-Za-z0-9_$]+;/);
    expect(page).toContain("ontoolresult");
    expect(page).toContain("cardHtml");
    expect(page.length).toBeGreaterThan(100_000);
  });
  it("the Play button copes with a blocked play() and tells the host when playback starts", () => {
    const page = storyCardPage();
    expect(page).toContain("audio.play().then(");
    expect(page).toContain("Can't play here");
    expect(page).toContain('postMessage({ type: "radio-commons:playing" }');
  });
});
