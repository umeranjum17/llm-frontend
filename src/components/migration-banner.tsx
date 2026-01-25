"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { checkMigration, forceMigration } from "@/lib/db/migration";

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
    checkMigrationStatus();
  }, []);

  const checkMigrationStatus = async () => {
    const migrationCheck = await checkMigration();
    setNeedsMigration(migrationCheck.needsMigration);
    setMigrationInfo(migrationCheck);
    if (migrationCheck.needsMigration) {
      console.warn("[Migration]", migrationCheck.message);
    }
  };

  const handleMigration = async () => {
    setIsMigrating(true);
    try {
      await forceMigration();
      // Migration successful - reload the page
      window.location.reload();
    } catch (error) {
      console.error("[Migration] Migration error:", error);
      alert("Migration failed. Please refresh the page manually (Ctrl+R or Cmd+R).");
    } finally {
      setIsMigrating(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  if (!needsMigration || isDismissed) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-yellow-500/95 backdrop-blur-sm border-b border-yellow-600 shadow-lg">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1">
            <AlertTriangle className="h-5 w-5 text-yellow-900 flex-shrink-0" />
            <div className="flex-1">
              <p className="font-semibold text-yellow-900 text-sm">
                Database Migration Required
              </p>
              <p className="text-xs text-yellow-900/80">
                {migrationInfo?.message || `Update needed from v${migrationInfo?.currentVersion} to v${migrationInfo?.targetVersion}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMigration}
              disabled={isMigrating}
              className="bg-yellow-900 hover:bg-yellow-800 text-white"
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
              onClick={handleDismiss}
              className="text-yellow-900 hover:bg-yellow-600/20"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
