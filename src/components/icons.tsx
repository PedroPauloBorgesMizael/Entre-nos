import type { SVGProps } from 'react';

const base = { width: '1em', height: '1em', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false } as const;

export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const CopyIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2.5" />
    <path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" />
  </svg>
);
export const ArrowLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
export const EyeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);
export const PencilIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1Z" />
  </svg>
);
export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const TrashIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </svg>
);

/** Coração preenchido — usado na animação e nos selos. */
export const HeartShape = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...p}>
    <path
      fill="currentColor"
      d="M12 21.2c-.3 0-.6-.1-.8-.3C6.2 16.8 2.5 13.6 2.5 9.4 2.5 6.6 4.6 4.5 7.3 4.5c1.9 0 3.6 1 4.7 2.6 1.1-1.6 2.8-2.6 4.7-2.6 2.7 0 4.8 2.1 4.8 4.9 0 4.2-3.7 7.4-8.7 11.5-.2.2-.5.3-.8.3Z"
    />
  </svg>
);

/** Rosa em traço fino, discreta (detalhe da tela de convite). */
export const RoseMark = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 64 72" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...p}>
    <path d="M32 9c-9 0-15.5 6.5-15.5 15 0 9.5 7.5 17 15.5 17s15.5-7.5 15.5-17c0-8.5-6.5-15-15.5-15Z" />
    <path d="M32 15.5c-5.7 0-10 4.3-10 9.7 0 6 4.7 10.3 10 10.3s10-4.3 10-10.3c0-5.4-4.3-9.7-10-9.7Z" />
    <path d="M32 22c-3.2 0-5.8 2.4-5.8 5.6 0 3.2 2.6 5.4 5.8 5.4s5.8-2.2 5.8-5.4" />
    <path d="M28 25.5c1.2-1.7 4.6-2 6 .3" />
    <path d="M32 41v27" />
    <path d="M32 54c-6.5-.5-10.5-4.5-11-10.5 6.5.2 10.7 3.8 11 10.5Z" />
    <path d="M32 60c5.6-.4 9-3.7 9.6-8.8-5.6.2-9.3 3.2-9.6 8.8Z" />
  </svg>
);
