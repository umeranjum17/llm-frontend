"use client";

import { useMediaQuery } from "@/hooks/use-media-query";
import { useUIStore } from "@/stores/ui-store";

/**
 * Controls which Claw surface should be shown based on device/layout context.
 *
 * Architecture:
 * - DESKTOP (sidebar visible): Sidebar widget is PRIMARY, hide floating
 * - MOBILE (sidebar hidden): Floating is PRIMARY
 * - CHAT: Minimal status dot only (not full notifications)
 */
export function useClawSurface() {
  const isMobile = useMediaQuery("(max-width: 768px)");
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  // On mobile, sidebar is never "open" in the traditional sense
  const sidebarOpen = !isMobile && !sidebarCollapsed;

  return {
    // Desktop with sidebar open: sidebar widget is primary
    showSidebarWidget: !isMobile,
    // Mobile OR desktop with sidebar closed: floating is primary
    showFloating: isMobile || !sidebarOpen,
    // Chat enrichment: only on desktop as minimal indicator
    showChatEnrichment: !isMobile,
  };
}
