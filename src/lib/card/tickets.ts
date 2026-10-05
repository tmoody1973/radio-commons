// Their links carry affiliate and tracking parameters; the event path alone opens the same page.
const TRACKED_TICKET_HOSTS = ["ticketmaster.com", "livenation.com", "axs.com"];

/** A ticket link fit for a card button: https only, tracking stripped from the big sellers; anything else is null. */
export function cleanTicketUrl(url: string | null | undefined): string | null {
  if (!url || !URL.canParse(url)) return null;
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") return null;
  const host = parsed.hostname.toLowerCase();
  if (TRACKED_TICKET_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
    parsed.search = "";
    parsed.hash = "";
  }
  return parsed.toString();
}
