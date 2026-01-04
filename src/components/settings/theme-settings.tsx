"use client";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sun, Moon, Laptop } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeSettings() {
  const { theme, setTheme } = useTheme();

  const themes = [
    {
      id: "light",
      name: "Light",
      description: "Light mode for daytime use",
      icon: Sun,
    },
    {
      id: "dark",
      name: "Dark",
      description: "Dark mode for nighttime use",
      icon: Moon,
    },
    {
      id: "system",
      name: "System",
      description: "Follow system preference",
      icon: Laptop,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Theme</h3>
        <p className="text-sm text-muted-foreground">
          Choose your preferred color scheme
        </p>
      </div>

      <RadioGroup value={theme} onValueChange={setTheme}>
        <div className="grid gap-3">
          {themes.map((themeOption) => {
            const Icon = themeOption.icon;
            const isSelected = theme === themeOption.id;

            return (
              <label
                key={themeOption.id}
                htmlFor={themeOption.id}
                className={cn(
                  "flex items-center gap-4 p-4 border rounded-lg cursor-pointer transition-colors hover:bg-accent",
                  isSelected && "border-primary bg-accent"
                )}
              >
                <RadioGroupItem value={themeOption.id} id={themeOption.id} />
                <div className="flex items-center gap-3 flex-1">
                  <div className="p-2 rounded-md bg-muted">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{themeOption.name}</div>
                    <div className="text-sm text-muted-foreground">
                      {themeOption.description}
                    </div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </RadioGroup>

      {/* Preview */}
      <div className="space-y-2">
        <Label>Preview</Label>
        <div className="p-4 border rounded-lg">
          <div className="space-y-2">
            <div className="text-sm font-medium">Sample UI Elements</div>
            <div className="flex gap-2">
              <Button size="sm">Primary</Button>
              <Button size="sm" variant="secondary">
                Secondary
              </Button>
              <Button size="sm" variant="outline">
                Outline
              </Button>
            </div>
            <div className="text-sm text-muted-foreground">
              This is how text will appear in the current theme
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
