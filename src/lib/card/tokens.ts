/** Alexa+ design tokens (Amazon MCP Design Guide, Visual Foundations), with Radio Milwaukee orange on primary actions only. */
export const TOKENS = {
  accent: "#F7941D",
  onAccent: "#1E2124",
  light: { screen: "#FAF9FB", card: "#FFFFFF", inner: "#F4F2F7", text: "#14181E", muted: "#4A5260", secondary: "#ECEAF0" },
  dark: { screen: "#0B0E13", card: "#14181E", inner: "#1B2028", text: "#F4F5F7", muted: "#AEB6C2", secondary: "#232F40" },
} as const;

/** Where the card's static assets live (the logo); the map picture comes from the same site. */
export const SITE = process.env.PUBLIC_BASE_URL ?? "https://radio-commons.vercel.app";
