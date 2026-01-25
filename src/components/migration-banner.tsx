"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { checkMigration, forceMigration } from "@/lib/db/migration";
import { db } from "@/lib/db/schema";

export function MigrationBanner() {
  const [needsMigration, setNeedsMigration] = useState(false);
  const [migrationInfo, setMigrationInfo] = useState<{
    currentVersion: number;
    targetVersion: number;
    message?: string;
  } | null>(null);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Wait a bit for DB to initialize before checking
    const timer = setTimeout(() => {
      checkMigrationStatus();
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const checkMigrationStatus = async () => {
    // Ensure DB is open first
    if (!db.isOpen()) {
      try {
        await db.open();
      } catch (error) {
        console.warn("[MigrationBanner] Failed to open DB for check:", error);
      }
    }

    const migrationCheck = await checkMigration();
    console.log("[MigrationBanner] Migration check result:", migrationCheck);
    setNeedsMigration(migrationCheck.needsMigration);
    setMigrationInfo(migrationCheck);
    if (migrationCheck.needsMigration) {
      console.warn("[MigrationBanner]", migrationCheck.message);
    }
  };

  const handleMigration = useCallback(async () => {
    console.log("[MigrationBanner] Run Migration clicked");
    setIsMigrating(true);
    try {
      await forceMigration();
      console.log("[MigrationBanner] Migration completed, reloading...");
      // Migration successful - reload the page
      window.location.reload();
    } catch (error) {
      console.error("[MigrationBanner] Migration error:", error);
      alert(`Migration failed: ${(error as Error)?.message || "Unknown error"}. Please refresh the page manually.`);
    } finally {
      setIsMigrating(false);
    }
  }, []);

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  if (!needsMigration || isDismissed) {
    return null;
  }

  // Truncate long messages (don't show all table names)
  const displayMessage = migrationInfo?.message?.includes("missing:")
    ? `Database schema incomplete - some tables need to be created`
    : migrationInfo?.message || `Update needed from v${migrationInfo?.currentVersion} to v${migrationInfo?.targetVersion}`;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[9999] bg-yellow-500 border-b border-yellow-600 shadow-lg pointer-events-auto"
      style={{ position: 'fixed', top: 0 }}
    >
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <AlertTriangle className="h-5 w-5 text-yellow-900 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-yellow-900 text-sm">
                Database Migration Required
              </p>
              <p className="text-xs text-yellow-900/80 truncate">
                {displayMessage}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleMigration();
              }}
              disabled={isMigrating}
              className="bg-yellow-900 hover:bg-yellow-800 text-white pointer-events-auto"
            >
              {isMigrating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Migrating...
                </>
              ) : (
                "Run Migration"
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDismiss();
              }}
              className="text-yellow-900 hover:bg-yellow-600/20 pointer-events-auto"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
