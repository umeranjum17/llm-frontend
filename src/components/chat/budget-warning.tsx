"use client";

import { useState, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, DollarSign } from "lucide-react";
import { getMessages } from "@/lib/db/queries";
import type { Message } from "@/lib/db/schema";
import { getChatById } from "@/lib/db/queries";

interface BudgetWarningProps {
  chatId: string;
  estimatedCost: number;
  onProceed: () => void;
  onCancel: () => void;
}

// Calculate total cost of all messages in a chat
async function calculateChatCost(chatId: string): Promise<number> {
  const messages = await getMessages(chatId);
  return messages.reduce((sum: number, msg: Message) => sum + (msg.cost || 0), 0);
}

export function BudgetWarning({
  chatId,
  estimatedCost,
  onProceed,
  onCancel,
}: BudgetWarningProps) {
  const [showWarning, setShowWarning] = useState(false);
  const [chatCost, setChatCost] = useState(0);

  const chat = useLiveQuery(() => getChatById(chatId), [chatId]);
  const budgetCap = chat?.budgetCap || null;

  useEffect(() => {
    const checkBudget = async () => {
      const cost = await calculateChatCost(chatId);
      setChatCost(cost);

      if (budgetCap && cost + estimatedCost >= budgetCap * 0.9) {
        setShowWarning(true);
      }
    };

    checkBudget();
  }, [chatId, estimatedCost, budgetCap]);

  const percentUsed = budgetCap
    ? ((chatCost + estimatedCost) / budgetCap) * 100
    : 0;
  const isOverBudget = budgetCap && chatCost + estimatedCost > budgetCap;

  if (!budgetCap) return null;

  return (
    <>
      {/* Warning Banner */}
      {percentUsed >= 50 && percentUsed < 90 && (
        <Alert variant="default" className="mb-2">
          <DollarSign className="h-4 w-4" />
          <AlertTitle>Budget Notice</AlertTitle>
          <AlertDescription>
            You&apos;ve used ${chatCost.toFixed(4)} of your ${budgetCap.toFixed(2)}{" "}
            budget ({percentUsed.toFixed(0)}%)
          </AlertDescription>
        </Alert>
      )}

      {/* Critical Warning Dialog */}
      <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              {isOverBudget ? "Budget Exceeded" : "Approaching Budget Limit"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-2 pt-2">
                <p>
                  Current spend: <strong>${chatCost.toFixed(4)}</strong>
                </p>
                <p>
                  This message: <strong>${estimatedCost.toFixed(4)}</strong>
                </p>
                <p>
                  Total: <strong>${(chatCost + estimatedCost).toFixed(4)}</strong>
                </p>
                <p>
                  Budget cap: <strong>${budgetCap.toFixed(2)}</strong>
                </p>
                <p className="text-sm text-muted-foreground pt-2">
                  {isOverBudget
                    ? "This message will exceed your budget cap. Do you want to proceed?"
                    : "You've used over 90% of your budget. Do you want to continue?"}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onProceed}>
              {isOverBudget ? "Proceed Anyway" : "Continue"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
