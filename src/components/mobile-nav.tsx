"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Plus, Settings, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useState } from "react";

// This is the floating nav for non-chat pages (settings, etc.)
// On chat pages (home "/"), the nav is integrated into the input area
export function MobileNav() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const pathname = usePathname();

    // Don't show floating nav on home/chat page - it's integrated into input area there
    if (pathname === "/") {
        return null;
    }

    const handleNewChat = () => {
        const event = new CustomEvent("lumina:new-chat");
        window.dispatchEvent(event);
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe">
            <div className="mx-3 mb-3 flex items-center justify-around rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl px-1 py-1 shadow-lg shadow-black/20">
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-white">
                            <Menu className="h-4 w-4" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 border-r border-white/10 bg-background/80 backdrop-blur-xl w-[300px] [&>button]:hidden">
                        <Sidebar onNavigate={() => setSidebarOpen(false)} />
                    </SheetContent>
                </Sheet>

                <Link href="/" prefetch>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-white"
                    >
                        <MessageSquare className="h-4 w-4" />
                    </Button>
                </Link>

                <Button
                    variant="default"
                    size="icon"
                    className="h-10 w-10 rounded-full bg-primary shadow-lg shadow-primary/30"
                    onClick={handleNewChat}
                >
                    <Plus className="h-4 w-4" />
                </Button>

                <Link href="/settings" prefetch>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-white"
                    >
                        <Settings className="h-4 w-4" />
                    </Button>
                </Link>
            </div>
        </div>
    );
}

// Inline nav component for chat pages - integrated into input area
export function MobileNavInline() {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleNewChat = () => {
        const event = new CustomEvent("lumina:new-chat");
        window.dispatchEvent(event);
    };

    return (
        <div className="flex sm:hidden items-center justify-around rounded-xl border border-border/50 bg-muted/30 px-1 py-1">
            <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground">
                        <Menu className="h-4 w-4" />
                    </Button>
                </SheetTrigger>
                <SheetContent side="left" className="p-0 border-r border-white/10 bg-background/80 backdrop-blur-xl w-[300px] [&>button]:hidden">
                    <Sidebar onNavigate={() => setSidebarOpen(false)} />
                </SheetContent>
            </Sheet>

            <Link href="/" prefetch>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground"
                >
                    <MessageSquare className="h-4 w-4" />
                </Button>
            </Link>

            <Button
                variant="default"
                size="icon"
                className="h-9 w-9 rounded-full bg-primary shadow-md"
                onClick={handleNewChat}
            >
                <Plus className="h-4 w-4" />
            </Button>

            <Link href="/settings" prefetch>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground"
                >
                    <Settings className="h-4 w-4" />
                </Button>
            </Link>
        </div>
    );
}
