import type { ReactNode } from "react";

const line = (size: number, children: ReactNode, weight = 2) => (
  <svg
    aria-hidden="true"
    focusable="false"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={weight}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);
const solid = (size: number, children: ReactNode) => (
  <svg
    aria-hidden="true"
    focusable="false"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    {children}
  </svg>
);

export const ICON_GEAR = line(
  20,
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </>,
);
export const ICON_SLIDERS = line(
  20,
  <>
    <path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1" />
    <circle cx="15" cy="6.5" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="17.5" r="2" />
  </>,
);
export const ICON_QUEUE = line(
  20,
  <>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
  </>,
);
export const ICON_QUEUE_ADD = line(
  20,
  <path d="M4 6h11M4 12h8M4 18h6M18 13v8M14 17h8" />,
);
export const ICON_APPEAR = line(
  20,
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path
      d="M12 3.5a8.5 8.5 0 000 17z"
      fill="currentColor"
      stroke="none"
    />
  </>,
);
export const ICON_SHUFFLE = line(
  20,
  <>
    <path d="M3 7h3.5c2 0 3.2.9 4.3 2.6l2.4 4.8c1.1 1.7 2.3 2.6 4.3 2.6H21" />
    <path d="M3 17h3.5c1.5 0 2.5-.5 3.4-1.5M13.1 8.5c.9-1 1.9-1.5 3.4-1.5H21" />
    <path d="M18 4l3 3-3 3M18 14l3 3-3 3" />
  </>,
);
export const ICON_REPEAT = line(
  20,
  <>
    <path d="M17 3l3 3-3 3" />
    <path d="M4 11.5V10a4 4 0 014-4h12" />
    <path d="M7 21l-3-3 3-3" />
    <path d="M20 12.5V14a4 4 0 01-4 4H4" />
  </>,
);
export const ICON_PREV = solid(
  26,
  <path d="M11 7.2v9.6c0 .8-.9 1.3-1.6.8L2.9 13a1.2 1.2 0 010-2l6.5-4.6c.7-.5 1.6 0 1.6.8zm10 0v9.6c0 .8-.9 1.3-1.6.8L12.9 13a1.2 1.2 0 010-2l6.5-4.6c.7-.5 1.6 0 1.6.8z" />,
);
export const ICON_NEXT = solid(
  26,
  <path d="M13 7.2v9.6c0 .8.9 1.3 1.6.8l6.5-4.6a1.2 1.2 0 000-2l-6.5-4.6c-.7-.5-1.6 0-1.6.8zm-10 0v9.6c0 .8.9 1.3 1.6.8l6.5-4.6a1.2 1.2 0 000-2L4.6 6.4C3.9 5.9 3 6.4 3 7.2z" />,
);
export const ICON_PLAY = solid(
  32,
  <path d="M8 5.9v12.2c0 1 1.1 1.6 1.9 1.1l9.6-6.1a1.3 1.3 0 000-2.2L9.9 4.8C9.1 4.3 8 4.9 8 5.9z" />,
);
export const ICON_PAUSE = solid(
  32,
  <>
    <rect x="6" y="4.5" width="4.2" height="15" rx="1.3" />
    <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.3" />
  </>,
);
export const ICON_CLOSE = line(18, <path d="M17 7L7 17M7 7l10 10" />, 2.4);
export const ICON_PLUS = line(18, <path d="M12 5v14M5 12h14" />, 2.4);
export const ICON_MINUS = line(18, <path d="M5 12h14" />, 2.4);
export const ICON_TRASH = line(
  20,
  <>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7" />
  </>,
);
export const ICON_MOON = line(
  20,
  <path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" />,
);
export const ICON_NOTE = line(
  22,
  <>
    <path d="M9 18V5.5l11-2V16" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="17.5" cy="16" r="2.5" />
  </>,
);
export const ICON_WAVEFORM = line(
  22,
  <path d="M3 10v4M7 7v10M11 4v16M15 8v8M19 10.5v3" />,
  2.2,
);
export const ICON_LIBRARY = line(
  22,
  <>
    <rect x="3" y="7" width="14" height="14" rx="3" />
    <path d="M7 3.5h10.5A3.5 3.5 0 0121 7v10.5" />
    <path d="M11.5 17.5v-6l3-.7" />
    <circle cx="9.8" cy="17.5" r="1.7" />
  </>,
);
