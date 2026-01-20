"use client";

import { useEffect, useState } from "react";
import type { Transition, TargetAndTransition, VariantLabels } from "framer-motion";

interface ReducedMotionConfig {
  initial: false;
  animate: TargetAndTransition | VariantLabels;
  transition: Transition;
}

/**
 * Hook to handle reduced motion preferences for Framer Motion animations.
 * Returns null for normal motion, or config overrides for reduced motion.
 *
 * Usage:
 * ```tsx
 * const motionConfig = useMotionConfig();
 *
 * <motion.div
 *   {...motionConfig}
 *   initial={motionConfig?.initial ?? { opacity: 0 }}
 *   animate={motionConfig?.animate ?? { opacity: 1 }}
 * />
 * ```
 */
export function useMotionConfig(): ReducedMotionConfig | null {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check if window is available (client-side)
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  if (prefersReducedMotion) {
    return {
      initial: false,
      animate: {},
      transition: { duration: 0 },
    };
  }

  return null;
}

/**
 * Hook to check if user prefers reduced motion.
 * Useful for conditionally applying animations.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
}

// Standard animation presets that respect reduced motion
export const motionPresets = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15 },
  },
  slideUp: {
    initial: { opacity: 0, y: 10 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 10 },
    transition: { duration: 0.2, ease: [0, 0, 0.2, 1] },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.15 },
  },
  slideFromRight: {
    initial: { opacity: 0, x: 10 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 10 },
    transition: { duration: 0.2 },
  },
  springScale: {
    whileHover: { scale: 1.05 },
    whileTap: { scale: 0.95 },
    transition: { type: "spring", stiffness: 400, damping: 25 },
  },
  gentleScale: {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
    transition: { type: "spring", stiffness: 300, damping: 25 },
  },
} as const;
