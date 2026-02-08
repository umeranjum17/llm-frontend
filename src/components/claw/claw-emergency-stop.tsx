"use client";

import { useState } from "react";
import { OctagonX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useLuminaStore } from "@/stores/lumina-store";
import { toast } from "sonner";

export function ClawEmergencyStop() {
  const emergencyStop = useLuminaStore((s) => s.emergencyStop);
  const [stopping, setStopping] = useState(false);

  const handleStop = async () => {
    setStopping(true);
    try {
      const result = await emergencyStop();
      if (result?.ok) {
        toast.success("Emergency stop executed");
      } else {
        toast.error("Emergency stop failed");
      }
    } catch {
      toast.error("Emergency stop failed");
    } finally {
      setStopping(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-red-500 hover:text-red-600 hover:bg-red-500/10"
        >
          <OctagonX className="h-4 w-4 lg:mr-1.5" />
          <span className="hidden lg:inline">Stop</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Emergency Stop</AlertDialogTitle>
          <AlertDialogDescription>
            This will halt all autonomous operations immediately. Running tasks,
            schedules, and pipeline will be stopped. Are you sure?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleStop}
            disabled={stopping}
            className="bg-red-600 hover:bg-red-700"
          >
            {stopping ? "Stopping..." : "Stop Everything"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
