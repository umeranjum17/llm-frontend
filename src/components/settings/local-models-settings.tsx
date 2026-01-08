"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { CheckCircle2, XCircle, Loader2, RefreshCw, Server } from "lucide-react";
import { localDetector, type LocalProviderStatus } from "@/lib/providers/local-detector";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function LocalModelsSettings() {
  const [ollamaStatus, setOllamaStatus] = useState<LocalProviderStatus | null>(null);
  const [lmStudioStatus, setLmStudioStatus] = useState<LocalProviderStatus | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);
  const [checkingLMStudio, setCheckingLMStudio] = useState(false);
  const [ollamaPort, setOllamaPort] = useState(11434);
  const [lmStudioPort, setLmStudioPort] = useState(1234);

  const checkProvider = async (providerId: "ollama" | "lmstudio", port?: number) => {
    if (providerId === "ollama") {
      setCheckingOllama(true);
    } else {
      setCheckingLMStudio(true);
    }

    try {
      const status = await localDetector.checkProvider(providerId, port);
      if (providerId === "ollama") {
        setOllamaStatus(status);
        if (status.connected) {
          toast.success("Ollama connected");
        } else {
          toast.error(`Ollama: ${status.error || "Not available"}`);
        }
      } else {
        setLmStudioStatus(status);
        if (status.connected) {
          toast.success("LM Studio connected");
        } else {
          toast.error(`LM Studio: ${status.error || "Not available"}`);
        }
      }
    } catch (error) {
      toast.error(`Failed to check ${providerId}`);
    } finally {
      if (providerId === "ollama") {
        setCheckingOllama(false);
      } else {
        setCheckingLMStudio(false);
      }
    }
  };

  useEffect(() => {
    // Initial check
    checkProvider("ollama");
    checkProvider("lmstudio");

    // Start auto-checking every 10 seconds
    localDetector.startAutoCheck("ollama", 10000);
    localDetector.startAutoCheck("lmstudio", 10000);

    // Update status from cache periodically
    const interval = setInterval(() => {
      const ollama = localDetector.getStatus("ollama");
      const lmstudio = localDetector.getStatus("lmstudio");
      if (ollama) setOllamaStatus(ollama);
      if (lmstudio) setLmStudioStatus(lmstudio);
    }, 1000);

    return () => {
      localDetector.stopAllAutoChecks();
      clearInterval(interval);
    };
  }, []);

  const renderProviderStatus = (
    providerId: "ollama" | "lmstudio",
    status: LocalProviderStatus | null,
    checking: boolean,
    port: number,
    onPortChange: (port: number) => void,
    onCheck: () => void
  ) => {
    const isConnected = status?.connected ?? false;
    const isChecking = checking || (status?.checking ?? false);
    const error = status?.error;
    const models = status?.availableModels || [];

    return (
      <div className="space-y-4 p-4 border rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-muted-foreground" />
            <Label className="text-base font-semibold">
              {providerId === "ollama" ? "Ollama" : "LM Studio"}
            </Label>
            {isConnected ? (
              <Badge variant="default" className="bg-green-500">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Connected
              </Badge>
            ) : (
              <Badge variant="secondary">
                <XCircle className="h-3 w-3 mr-1" />
                {isChecking ? "Checking..." : "Disconnected"}
              </Badge>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onCheck}
            disabled={isChecking}
          >
            {isChecking ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Test Connection
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${providerId}-port`}>Port</Label>
          <div className="flex gap-2">
            <Input
              id={`${providerId}-port`}
              type="number"
              value={port}
              onChange={(e) => {
                const newPort = parseInt(e.target.value, 10);
                if (!isNaN(newPort) && newPort > 0 && newPort < 65536) {
                  onPortChange(newPort);
                }
              }}
              className="w-24"
              min={1}
              max={65535}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => checkProvider(providerId, port)}
              disabled={isChecking}
            >
              Update Port
            </Button>
          </div>
        </div>

        {status?.lastChecked && (
          <p className="text-xs text-muted-foreground">
            Last checked: {new Date(status.lastChecked).toLocaleTimeString()}
          </p>
        )}

        {error && !isConnected && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        {isConnected && models.length > 0 && (
          <div className="space-y-2">
            <Label>Available Models ({models.length})</Label>
            <div className="flex flex-wrap gap-2">
              {models.slice(0, 10).map((model) => (
                <Badge key={model} variant="outline" className="text-xs">
                  {model}
                </Badge>
              ))}
              {models.length > 10 && (
                <Badge variant="outline" className="text-xs">
                  +{models.length - 10} more
                </Badge>
              )}
            </div>
          </div>
        )}

        {isConnected && models.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No models found. Make sure models are downloaded.
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Local Models</h3>
        <p className="text-sm text-muted-foreground">
          Connect to local LLM providers running on your machine. No API keys required.
        </p>
      </div>

      <div className="space-y-4">
        {renderProviderStatus(
          "ollama",
          ollamaStatus,
          checkingOllama,
          ollamaPort,
          setOllamaPort,
          () => checkProvider("ollama", ollamaPort)
        )}

        {renderProviderStatus(
          "lmstudio",
          lmStudioStatus,
          checkingLMStudio,
          lmStudioPort,
          setLmStudioPort,
          () => checkProvider("lmstudio", lmStudioPort)
        )}
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>• Local providers are automatically detected and checked every 10 seconds</p>
        <p>• Make sure Ollama or LM Studio is running before connecting</p>
        <p>• Models will appear in the model picker when available</p>
      </div>
    </div>
  );
}


