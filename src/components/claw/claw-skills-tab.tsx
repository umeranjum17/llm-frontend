"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Download, Trash2, Package, RefreshCw, Star, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useClawStore } from "@/stores/claw-store";
import type { ClawSkillLocal, ClawSkillSearchResult, ClawHubCategory } from "@/lib/claw/types";
import { toast } from "sonner";

export function ClawSkillsTab() {
  const client = useClawStore((s) => s.client);

  const [installed, setInstalled] = useState<ClawSkillLocal[]>([]);
  const [hubInstalled, setHubInstalled] = useState<string[]>([]);
  const [searchResults, setSearchResults] = useState<ClawSkillSearchResult[]>([]);
  const [categories, setCategories] = useState<ClawHubCategory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);

  const refreshInstalled = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    try {
      const data = await client.getSkillsAvailable();
      setInstalled(data.local);
      setHubInstalled(data.hub);
    } catch (err: any) {
      toast.error("Failed to load skills", { description: err.message });
    } finally {
      setLoading(false);
    }
  }, [client]);

  const refreshCategories = useCallback(async () => {
    if (!client) return;
    try {
      const data = await client.getSkillCategories();
      setCategories(data.categories);
    } catch {}
  }, [client]);

  useEffect(() => {
    void refreshInstalled();
    void refreshCategories();
  }, [refreshInstalled, refreshCategories]);

  const handleSearch = async () => {
    if (!client || !searchQuery.trim()) return;
    setSearching(true);
    try {
      const data = await client.searchSkills(searchQuery, {
        limit: 20,
        category: selectedCategory ?? undefined,
      });
      setSearchResults(data.skills);
    } catch (err: any) {
      toast.error("Search failed", { description: err.message });
    } finally {
      setSearching(false);
    }
  };

  const handleInstall = async (slug: string) => {
    if (!client) return;
    setInstalling(slug);
    try {
      const result = await client.installSkill(slug);
      if (result.installed) {
        toast.success(`Installed ${slug}`, { description: `v${result.version}` });
        void refreshInstalled();
      }
    } catch (err: any) {
      toast.error(`Failed to install ${slug}`, { description: err.message });
    } finally {
      setInstalling(null);
    }
  };

  const handleUninstall = async (name: string) => {
    if (!client) return;
    setUninstalling(name);
    try {
      const result = await client.uninstallSkill(name);
      if (result.uninstalled) {
        toast.success(`Uninstalled ${name}`);
        void refreshInstalled();
      }
    } catch (err: any) {
      toast.error(`Failed to uninstall ${name}`, { description: err.message });
    } finally {
      setUninstalling(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Installed Skills */}
      <div className="rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Package className="h-4 w-4" />
            Installed Skills ({installed.length})
          </h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => void refreshInstalled()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        <div className="divide-y">
          {installed.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">No skills installed yet.</p>
          ) : (
            installed.map((skill) => (
              <div key={skill.name} className="flex items-center justify-between px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{skill.name}</span>
                    <Badge variant="outline" className="text-[10px]">{skill.source}</Badge>
                    {skill.userInvocable && <Badge variant="secondary" className="text-[10px]">invocable</Badge>}
                  </div>
                  {skill.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{skill.description}</p>
                  )}
                </div>
                {skill.source !== "builtin" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => void handleUninstall(skill.name)}
                    disabled={uninstalling === skill.name}
                  >
                    {uninstalling === skill.name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ClawHub Search */}
      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
            <Search className="h-4 w-4" />
            Browse ClawHub
          </h3>
          <div className="flex gap-2">
            <Input
              placeholder="Search 700+ skills..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void handleSearch()}
              className="h-8 text-sm"
            />
            <Button size="sm" className="h-8 shrink-0" onClick={() => void handleSearch()} disabled={searching || !searchQuery.trim()}>
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </Button>
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {categories.slice(0, 8).map((cat) => (
                <Badge
                  key={cat.slug}
                  variant={selectedCategory === cat.slug ? "default" : "outline"}
                  className="text-[10px] cursor-pointer"
                  onClick={() => setSelectedCategory(selectedCategory === cat.slug ? null : cat.slug)}
                >
                  {cat.name} ({cat.count})
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="divide-y">
          {searchResults.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              {searching ? "Searching..." : "Search ClawHub to discover skills."}
            </p>
          ) : (
            searchResults.map((skill) => (
              <div key={skill.slug} className="flex items-start justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{skill.name}</span>
                    <span className="text-[10px] text-muted-foreground">v{skill.version}</span>
                    {skill.rating > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                        <Star className="h-2.5 w-2.5 fill-current" />
                        {skill.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground">{skill.author}</span>
                    <span className="text-[10px] text-muted-foreground">{skill.downloads.toLocaleString()} downloads</span>
                    {skill.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[9px]">{tag}</Badge>
                    ))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={hubInstalled.includes(skill.slug) ? "outline" : "default"}
                  className="h-7 shrink-0 ml-2"
                  onClick={() => void handleInstall(skill.slug)}
                  disabled={installing === skill.slug}
                >
                  {installing === skill.slug ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : hubInstalled.includes(skill.slug) ? (
                    "Reinstall"
                  ) : (
                    <>
                      <Download className="h-3 w-3 mr-1" />
                      Install
                    </>
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
