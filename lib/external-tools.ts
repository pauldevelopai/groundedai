// External Develop AI tools that live alongside Anchor in the menu.
// These are separate apps with their own auth and data — Anchor only
// links to them. SSO + content sharing is a future slice (see HANDOFF
// integration plan).
//
// Adding a new external tool: push an entry below. The shared
// ExternalToolLinks component renders them automatically in every top
// header, and /guide picks them up for its "Develop AI ecosystem"
// section.
//
// .ts because the project's root package.json has "type": "commonjs".
// Anything imported from TSX components must be ESM, and TypeScript
// files are ESM under Next.js's bundler.

export type ExternalTool = {
  slug: string;
  name: string;
  icon: string;
  url: string;
  description: string;
};

export const EXTERNAL_TOOLS: ExternalTool[] = [
  {
    slug: 'aikit',
    name: 'AIKit',
    icon: '🛠️',
    url: 'https://www.aikit.co.za',
    description:
      "Develop AI's editorial AI toolkit — chat over your AI tool guides, run a strategy wizard, and discover new AI tools curated for newsrooms.",
  },
  {
    slug: 'grounded',
    name: 'GROUNDED',
    icon: '🌍',
    url: 'https://www.grounded.developai.co.za',
    description:
      "Develop AI's data practice. Anchor sits inside this umbrella, alongside Tracker, Awareness, MediaMap, and the training cohorts.",
  },
];
