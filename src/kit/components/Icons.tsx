import React from "react";

/**
 * Minimal, dependency-free icon set used across the OrderLedger kit.
 * Kept local (no lucide-react / icon package) so the kit drops into any
 * React/Vite project with zero extra installs. Swap for your own icon
 * library at will — every component only expects a React node.
 */

type IconProps = React.SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconUpload = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 16V4M12 4l-4 4M12 4l4 4" />
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const IconImageStack = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="5" y="7" width="14" height="12" rx="2" />
    <path d="M8 3.5h8a2 2 0 0 1 2 2V5" />
    <circle cx="9.5" cy="11.5" r="1.3" />
    <path d="M6 17l3.5-3.5a1.5 1.5 0 0 1 2 0L15 17" />
  </svg>
);

export const IconInbox = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 12h4l1.5 3h5L16 12h4" />
    <path d="M5 12 4 6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1l-1 6" />
    <path d="M4 12v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" />
  </svg>
);

export const IconCpu = (p: IconProps) => (
  <svg {...base} {...p}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
    <rect x="10" y="10" width="4" height="4" rx="0.5" />
    <path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2" />
  </svg>
);

export const IconCheck = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);

export const IconCheckCircle = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12.3l2.4 2.4 4.6-5.2" />
  </svg>
);

export const IconAlertTriangle = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 4.5 21 19H3L12 4.5Z" />
    <path d="M12 10v4" />
    <circle cx="12" cy="16.6" r="0.15" fill="currentColor" />
  </svg>
);

export const IconAlertCircle = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 8v5" />
    <circle cx="12" cy="15.8" r="0.15" fill="currentColor" />
  </svg>
);

export const IconInfo = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5" />
    <circle cx="12" cy="8.3" r="0.15" fill="currentColor" />
  </svg>
);

export const IconX = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconChevronRight = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const IconSearch = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.3-4.3" />
  </svg>
);

export const IconStar = (p: IconProps & { filled?: boolean }) => {
  const { filled, ...rest } = p;
  return (
    <svg {...base} fill={filled ? "currentColor" : "none"} {...rest}>
      <path d="M12 3.5l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7L12 3.5Z" />
    </svg>
  );
};

export const IconPlus = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconTrash = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
  </svg>
);

export const IconFileSheet = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M9 12h6M9 15.5h6M9 8.5h2" />
  </svg>
);

export const IconFileText = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M9 12h6M9 15.5h4" />
  </svg>
);

export const IconFilePdf = (p: IconProps) => (
  <svg {...base} {...p}>
    <path d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
    <path d="M9 17v-5h1.4a1.3 1.3 0 1 1 0 2.6H9M13 12v5M13 14.3h1.6M17 12v5" />
  </svg>
);

export const IconClock = (p: IconProps) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
