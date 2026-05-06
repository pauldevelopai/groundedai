// ExternalToolLinks — renders the EXTERNAL_TOOLS catalog as a small list
// of menu links, each opening in a separate tab. Pure functional component
// so it works in both server and client contexts. Used in every top header.

import { EXTERNAL_TOOLS } from '@/lib/external-tools';

export default function ExternalToolLinks({
  size = 'sm',
  marginLeft = 8,
}: {
  size?: 'sm' | 'md';
  marginLeft?: number;
}) {
  const fontSize = size === 'sm' ? 12 : 13;
  return (
    <>
      {EXTERNAL_TOOLS.map((tool, i) => (
        <a
          key={tool.slug}
          href={tool.url}
          target="_blank"
          rel="noopener noreferrer"
          title={tool.description}
          style={{
            fontSize,
            color: '#666',
            // First link uses caller's marginLeft; subsequent ones always
            // get inter-link spacing so they don't butt up against each other.
            marginLeft: i === 0 ? marginLeft : 10,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {tool.icon} {tool.name} ↗
        </a>
      ))}
    </>
  );
}
