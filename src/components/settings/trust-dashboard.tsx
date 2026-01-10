"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Eye, EyeOff, Database, Server, CheckCircle2, AlertCircle } from "lucide-react";
import { useApiKeysStore } from "@/stores/api-keys-store";
import { cn } from "@/lib/utils";

export function TrustDashboard() {
  const { keys } = useApiKeysStore();

  const hasApiKeys = keys.length > 0;
  const hasLocalProviders = keys.some(k => k.provider === "ollama" || k.provider === "lmstudio");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Trust & Privacy</h2>
        <p className="text-muted-foreground">
          Your data stays local. API keys are encrypted and never leave your device.
        </p>
      </div>

      {/* Data Flow Visualization */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Flow
          </CardTitle>
          <CardDescription>
            See exactly where your data goes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/30">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-4 w-4 text-green-600" />
                <span className="font-medium">Local Storage</span>
                <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
                  Encrypted
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                All chats, messages, and settings are stored locally in your browser using IndexedDB.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/30">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Lock className="h-4 w-4 text-blue-600" />
                <span className="font-medium">API Keys</span>
                <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-200">
                  Encrypted
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Your API keys are encrypted and stored locally. They are only sent directly to the AI provider you choose.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/30">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <Server className="h-4 w-4 text-purple-600" />
                <span className="font-medium">AI Providers</span>
                {hasLocalProviders && (
                  <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-200">
                    Local Available
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                Your messages are sent directly to the AI provider you select. We don&apos;t log or store your conversations.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Privacy Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EyeOff className="h-5 w-5" />
            Privacy Status
          </CardTitle>
          <CardDescription>
            Current privacy configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Data Storage</span>
            </div>
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
              Local Only
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">API Key Security</span>
            </div>
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
              Encrypted
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Logging</span>
            </div>
            <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-200">
              No Logs
            </Badge>
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-2">
              {hasApiKeys ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-amber-600" />
              )}
              <span className="text-sm font-medium">API Keys Configured</span>
            </div>
            <Badge 
              variant="outline" 
              className={cn(
                hasApiKeys 
                  ? "bg-green-500/10 text-green-600 border-green-200"
                  : "bg-amber-500/10 text-amber-600 border-amber-200"
              )}
            >
              {hasApiKeys ? `${keys.length} Key${keys.length > 1 ? "s" : ""}` : "Not Configured"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* BYOK Messaging */}
      <Card>
        <CardHeader>
          <CardTitle>Bring Your Own Key (BYOK)</CardTitle>
          <CardDescription>
            Full control over your API usage and costs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Your API keys are stored locally and encrypted</p>
          <p>• You pay directly to the AI provider - no markup</p>
          <p>• We never see or store your API keys</p>
          <p>• All data stays on your device by default</p>
          <p>• No usage limits or subscription fees</p>
        </CardContent>
      </Card>
    </div>
  );
}
