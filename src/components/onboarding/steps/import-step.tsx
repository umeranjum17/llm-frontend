"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Upload,
  ArrowRight,
  Shield,
  Loader2,
  CheckCircle2,
  FileUp,
  Key,
  Server,
  Bot,
  MessageSquare,
  Settings,
  Star,
  Clock,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  importSettings,
  validateSettingsExport,
  readFileAsText,
  getImportPreview,
} from "@/lib/db/import-settings";
import {
  decryptSettings,
  isValidEncryptedFormat,
  checkExpiration,
} from "@/lib/crypto/settings-crypto";
import { toast } from "sonner";

interface ImportStepProps {
  onComplete: (hasApiKeys: boolean) => void;
  onSkip: () => void;
}

type ImportState = "select" | "decrypt" | "importing" | "success";

export function ImportStep({ onComplete, onSkip }: ImportStepProps) {
  const [state, setState] = useState<ImportState>("select");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<ReturnType<typeof getImportPreview> | null>(null);
  const [expirationInfo, setExpirationInfo] = useState<{
    isExpired: boolean;
    expiresAt?: Date;
    hasExpiration: boolean;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setIsProcessing(true);

    try {
      const content = await readFileAsText(file);

      if (!isValidEncryptedFormat(content)) {
        setError("Invalid file format. Please select a valid .lumina file.");
        setIsProcessing(false);
        return;
      }

      const expInfo = checkExpiration(content);
      setExpirationInfo(expInfo);

      if (expInfo.isExpired) {
        setError(`This backup expired on ${expInfo.expiresAt?.toLocaleDateString()}. Please use a newer backup.`);
        setIsProcessing(false);
        return;
      }

      setSelectedFile(file);
      setState("decrypt");
    } catch (err) {
      setError("Failed to read file");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDecrypt = async () => {
    if (!selectedFile || !password) return;

    setIsProcessing(true);
    setError("");

    try {
      const content = await readFileAsText(selectedFile);
      const decrypted = await decryptSettings(content, password);

      if (!validateSettingsExport(decrypted)) {
        setError("Decrypted data is invalid or corrupted");
        setIsProcessing(false);
        return;
      }

      // Get preview
      const previewData = getImportPreview(decrypted);
      setPreview(previewData);

      // Import with merge mode (safe for new installations)
      setState("importing");

      const result = await importSettings(decrypted, {
        mode: "merge",
        importApiKeys: true,
        importMcpServers: true,
        importAgents: true,
        importPrompts: true,
        importSettings: true,
        importModelFavorites: true,
        importModelAliases: true,
        importParameterPresets: true,
        importTags: true,
        importTagRules: true,
      });

      if (result.success || result.errors.length === 0) {
        setState("success");
        toast.success("Settings imported successfully!");

        // Delay to show success state, then proceed
        setTimeout(() => {
          onComplete(previewData.apiKeys > 0);
        }, 1500);
      } else {
        setError(`Import completed with ${result.errors.length} errors`);
        setState("decrypt");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decrypt file");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="w-full max-w-lg mx-auto"
    >
      <Card className="border-2">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Shield className="h-7 w-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Welcome to Lumina</CardTitle>
          <CardDescription className="text-base">
            {state === "select" && "Import your existing settings or start fresh"}
            {state === "decrypt" && "Enter your password to decrypt"}
            {state === "importing" && "Importing your settings..."}
            {state === "success" && "Import complete!"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {state === "select" && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".lumina"
                onChange={handleFileSelect}
                className="hidden"
              />

              <Button
                variant="outline"
                className="w-full h-24 border-dashed border-2 hover:border-primary hover:bg-primary/5"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
              >
                <div className="flex flex-col items-center gap-2">
                  {isProcessing ? (
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  ) : (
                    <FileUp className="h-6 w-6 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">
                    {isProcessing ? "Reading file..." : "Import .lumina backup"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Restore API keys, agents, and settings
                  </span>
                </div>
              </Button>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">or</span>
                </div>
              </div>

              <Button
                onClick={onSkip}
                className="w-full h-11 gap-2"
              >
                Start Fresh
                <ArrowRight className="h-4 w-4" />
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                You can always import settings later from Settings
              </p>
            </>
          )}

          {state === "decrypt" && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span className="truncate">{selectedFile?.name}</span>
              </div>

              {expirationInfo?.hasExpiration && expirationInfo.expiresAt && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
                  <Clock className="h-3 w-3" />
                  Expires: {expirationInfo.expiresAt.toLocaleDateString()}{" "}
                  {expirationInfo.expiresAt.toLocaleTimeString()}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="import-password">Decryption Password</Label>
                <Input
                  id="import-password"
                  type="password"
                  placeholder="Enter the backup password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && password) handleDecrypt();
                  }}
                  className={cn(error && "border-destructive")}
                  autoFocus
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg p-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setState("select");
                    setSelectedFile(null);
                    setPassword("");
                    setError("");
                  }}
                  className="flex-1 h-11"
                >
                  Back
                </Button>
                <Button
                  onClick={handleDecrypt}
                  disabled={!password || isProcessing}
                  className="flex-1 h-11 gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Decrypting...
                    </>
                  ) : (
                    <>
                      Import
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </>
          )}

          {state === "importing" && (
            <div className="py-8 flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Importing your settings...</p>
            </div>
          )}

          {state === "success" && preview && (
            <div className="py-4 space-y-4">
              <div className="flex justify-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-500/10">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                </div>
              </div>

              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <div className="text-sm font-medium text-center mb-3">Imported:</div>
                <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                  {preview.apiKeys > 0 && (
                    <div className="flex items-center gap-2">
                      <Key className="h-3.5 w-3.5" />
                      {preview.apiKeys} API keys
                    </div>
                  )}
                  {preview.mcpServers > 0 && (
                    <div className="flex items-center gap-2">
                      <Server className="h-3.5 w-3.5" />
                      {preview.mcpServers} MCP servers
                    </div>
                  )}
                  {preview.agents > 0 && (
                    <div className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5" />
                      {preview.agents} agents
                    </div>
                  )}
                  {preview.prompts > 0 && (
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-3.5 w-3.5" />
                      {preview.prompts} prompts
                    </div>
                  )}
                  {preview.modelFavorites > 0 && (
                    <div className="flex items-center gap-2">
                      <Star className="h-3.5 w-3.5" />
                      {preview.modelFavorites} favorites
                    </div>
                  )}
                  {preview.hasSettings && (
                    <div className="flex items-center gap-2">
                      <Settings className="h-3.5 w-3.5" />
                      User settings
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
