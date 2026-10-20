// Motion is CSS-first; this is the one check JavaScript-driven animations need.
export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
