"use client";

import { useState, useCallback } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ConfirmationDialogState {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "destructive";
  onConfirm?: () => void | Promise<void>;
}

let showConfirmDialog: ((options: Omit<ConfirmationDialogState, "open">) => Promise<boolean>) | null = null;

/**
 * Hook to show a confirmation dialog.
 * Returns a function that shows the dialog and resolves when the user confirms or cancels.
 *
 * @example
 * const confirm = useConfirmDialog();
 * const result = await confirm({
 *   title: "Delete item?",
 *   description: "This action cannot be undone.",
 *   variant: "destructive",
 * });
 * if (result) {
 *   // User confirmed
 * }
 */
export function useConfirmDialog() {
  return useCallback(
    (options: Omit<ConfirmationDialogState, "open">): Promise<boolean> => {
      if (!showConfirmDialog) {
        console.error("ConfirmationDialogProvider not found. Wrap your app with ConfirmationDialogProvider.");
        return Promise.resolve(false);
      }
      return showConfirmDialog(options);
    },
    []
  );
}

/**
 * Provider component for the confirmation dialog.
 * Must be placed at the root of your app to enable useConfirmDialog hook.
 */
export function ConfirmationDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmationDialogState>({
    open: false,
    title: "",
    description: "",
    confirmText: "Confirm",
    cancelText: "Cancel",
    variant: "default",
  });

  const [resolvePromise, setResolvePromise] = useState<((value: boolean) => void) | null>(null);

  // Register the global show function
  if (!showConfirmDialog) {
    showConfirmDialog = (options: Omit<ConfirmationDialogState, "open">): Promise<boolean> => {
      return new Promise((resolve) => {
        setState({
          open: true,
          title: options.title,
          description: options.description,
          confirmText: options.confirmText || "Confirm",
          cancelText: options.cancelText || "Cancel",
          variant: options.variant || "default",
          onConfirm: options.onConfirm,
        });
        setResolvePromise(() => resolve);
      });
    };
  }

  const handleConfirm = async () => {
    if (state.onConfirm) {
      await state.onConfirm();
    }
    setState((prev) => ({ ...prev, open: false }));
    if (resolvePromise) {
      resolvePromise(true);
      setResolvePromise(null);
    }
  };

  const handleCancel = () => {
    setState((prev) => ({ ...prev, open: false }));
    if (resolvePromise) {
      resolvePromise(false);
      setResolvePromise(null);
    }
  };

  return (
    <>
      {children}
      <AlertDialog open={state.open} onOpenChange={(open) => !open && handleCancel()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{state.title}</AlertDialogTitle>
            <AlertDialogDescription className="whitespace-pre-wrap">
              {state.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancel}>{state.cancelText}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              className={state.variant === "destructive" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
            >
              {state.confirmText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
