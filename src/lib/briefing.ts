import type { BackstoryClient } from "@/lib/backstory";
import type { NewsletterItem } from "@/lib/newsletter";

export type BriefingAction = { kind: "story"; storyId: string; title: string } | { kind: "picks" } | { kind: "page"; url: string };
export interface BriefingItem extends NewsletterItem { action: BriefingAction }

/**
 * What each newsletter item opens: this week's Concert Picks, the published story behind its page (Backstory decides,
 * and says nothing when unsure), or the page itself on radiomilwaukee.org. Lookups run together; order is kept.
 */
export async function linkItems(items: NewsletterItem[], backstory: Pick<BackstoryClient, "storyForPage">): Promise<BriefingItem[]> {
  return Promise.all(items.map(async (item): Promise<BriefingItem> => {
    if (new URL(item.url).pathname.startsWith("/concerts/")) return { ...item, action: { kind: "picks" } };
    const story = await backstory.storyForPage(item.url).catch(() => null);
    return { ...item, action: story ? { kind: "story", ...story } : { kind: "page", url: item.url } };
  }));
}
