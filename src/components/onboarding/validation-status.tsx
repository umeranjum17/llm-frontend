"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2, XCircle, Zap, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";

export type ValidationPhase = "idle" | "connecting" | "verifying" | "success" | "error";

interface ValidationStatusProps {
  phase: ValidationPhase;
  provider: string;
  responseTime?: number;
  errorMessage?: string;
  errorType?: string;
  suggestion?: string;
}

export function ValidationStatus({
  phase,
  provider,
  responseTime,
  errorMessage,
  errorType,
  suggestion,
}: ValidationStatusProps) {
  if (phase === "idle") return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={phase}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "rounded-lg p-3 text-sm",
          phase === "connecting" && "bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800",
          phase === "verifying" && "bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-200 dark:border-yellow-800",
          phase === "success" && "bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800",
          phase === "error" && "bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800"
        )}
      >
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="mt-0.5">
            {phase === "connecting" && (
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                <Wifi className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </motion.div>
            )}
            {phase === "verifying" && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <Zap className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
              </motion.div>
            )}
            {phase === "success" && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 10 }}
              >
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              </motion.div>
            )}
            {phase === "error" && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ duration: 0.3 }}
              >
                <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              </motion.div>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 space-y-1">
            {phase === "connecting" && (
              <div>
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  Connecting to {provider}...
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300">
                  Reaching {provider}&apos;s API servers
                </p>
              </div>
            )}

            {phase === "verifying" && (
              <div>
                <p className="font-medium text-yellow-900 dark:text-yellow-100">
                  Verifying with {provider}...
                </p>
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  Checking that your API key is valid and active
                </p>
              </div>
            )}

            {phase === "success" && (
              <div>
                <p className="font-medium text-green-900 dark:text-green-100">
                  Verified with {provider}!
                </p>
                <p className="text-xs text-green-700 dark:text-green-300">
                  {responseTime ? `Validated in ${(responseTime / 1000).toFixed(2)}s` : "Your API key is active and working"}
                </p>
              </div>
            )}

            {phase === "error" && (
              <div className="space-y-2">
                <div>
                  <p className="font-medium text-red-900 dark:text-red-100">
                    {getErrorTitle(errorType)}
                  </p>
                  <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                    {getErrorDescription(errorType, provider, errorMessage)}
                  </p>
                </div>
                {suggestion && (
                  <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                    {suggestion}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function getErrorTitle(errorType?: string): string {
  switch (errorType) {
    case "auth_error":
      return "Authentication failed";
    case "rate_limit":
      return "Rate limit reached";
    case "provider_error":
      return "Provider error";
    case "network_error":
      return "Connection failed";
    case "timeout":
      return "Request timeout";
    default:
      return "Validation failed";
  }
}

function getErrorDescription(errorType: string | undefined, provider: string, errorMessage?: string): string {
  switch (errorType) {
    case "auth_error":
      return `We successfully connected to ${provider}'s API, but your key was rejected. Please double-check your API key.`;
    case "rate_limit":
      return `${provider} is temporarily limiting requests. Please wait a moment before trying again.`;
    case "provider_error":
      return `${provider}'s servers returned an error. This is usually temporary - try again in a few moments.`;
    case "network_error":
      return `We couldn't connect to ${provider}'s servers. Please check your internet connection.`;
    case "timeout":
      return `The connection to ${provider} took too long. Please check your internet connection and try again.`;
    default:
      return errorMessage || `An unexpected error occurred while validating with ${provider}.`;
  }
}
