"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DollarSign, Trash2, TrendingUp, AlertTriangle } from "lucide-react";
import { getChatById, updateChat, getMessages } from "@/lib/db/queries";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface BudgetSettingsDialogProps {
  chatId: string;
  children?: React.ReactNode;
}

export function BudgetSettingsDialog({
  chatId,
  children,
}: BudgetSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  const chat = useLiveQuery(() => getChatById(chatId), [chatId]);
  const messages = useLiveQuery(() => getMessages(chatId), [chatId]);

  const currentBudget = chat?.budgetCap;
  const currentCost = chat?.totalCost || 0;

  // Calculate actual cost from messages
  const calculatedCost =
    messages?.reduce((sum, msg) => sum + (msg.cost || 0), 0) || 0;

  const handleSetBudget = async () => {
    const budget = parseFloat(budgetInput);
    if (!isNaN(budget) && budget > 0) {
      await updateChat(chatId, { budgetCap: budget });
      setOpen(false);
      setBudgetInput("");
    }
  };

  const handleRemoveBudget = async () => {
    await updateChat(chatId, { budgetCap: undefined });
    setOpen(false);
  };

  const percentUsed = currentBudget
    ? (calculatedCost / currentBudget) * 100
    : 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="ghost" size="sm" className="gap-2">
            <DollarSign className="h-4 w-4" />
            {currentBudget ? (
              <span className="text-xs">
                ${calculatedCost.toFixed(4)} / ${currentBudget.toFixed(2)}
              </span>
            ) : (
              <span className="text-xs">Set Budget</span>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Chat Budget Settings</DialogTitle>
          <DialogDescription>
            Receive a warning when you&apos;ve used this percentage of your budget.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Current Stats */}
          <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Current Spend</span>
              <span className="text-lg font-bold">${calculatedCost.toFixed(4)}</span>
            </div>
            {currentBudget && (
              <>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Budget Cap</span>
                    <span className="font-medium">${currentBudget.toFixed(2)}</span>
                  </div>
                  <Progress 
                    value={percentUsed} 
                    className={cn(
                      "h-3",
                      percentUsed >= 90 && "bg-red-500/20 [&>div]:bg-red-500",
                      percentUsed >= 50 && percentUsed < 90 && "bg-yellow-500/20 [&>div]:bg-yellow-500",
                      percentUsed < 50 && "bg-green-500/20 [&>div]:bg-green-500"
                    )}
                  />
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">Usage</span>
                    <div className="flex items-center gap-2">
                      {percentUsed >= 90 && (
                        <AlertTriangle className="h-3 w-3 text-red-500" />
                      )}
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          percentUsed >= 90 && "text-red-500",
                          percentUsed >= 50 && percentUsed < 90 && "text-yellow-500",
                          percentUsed < 50 && "text-green-500"
                        )}
                      >
                        {percentUsed.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
                {percentUsed >= 90 && (
                  <Badge variant="destructive" className="w-full justify-center">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Budget Warning: {percentUsed.toFixed(1)}% used
                  </Badge>
                )}
              </>
            )}
            <div className="pt-2 border-t flex justify-between text-xs text-muted-foreground">
              <span>Total Messages</span>
              <span className="font-medium">{messages?.length || 0}</span>
            </div>
          </div>

          {/* Set Budget Input */}
          <div className="space-y-2">
            <Label htmlFor="budget">Set Budget Cap (USD)</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <DollarSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="budget"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 5.00"
                  value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button onClick={handleSetBudget}>Set</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              You&apos;ll be warned at 90% usage and blocked at 100%
            </p>
          </div>

          {/* Quick Presets */}
          <div className="space-y-2">
            <Label>Quick Presets</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBudgetInput("1.00")}
              >
                $1
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBudgetInput("5.00")}
              >
                $5
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBudgetInput("10.00")}
              >
                $10
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBudgetInput("25.00")}
              >
                $25
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          {currentBudget && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleRemoveBudget}
              className="gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Remove Budget
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
