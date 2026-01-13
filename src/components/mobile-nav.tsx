"use client";

import Link from "next/link";
import { MessageSquare, Plus, Settings, Menu, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function MobileNav() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    const handleNewChat = () => {
        const event = new CustomEvent("lumina:new-chat");
        window.dispatchEvent(event);
        setIsExpanded(false);
    };

    // Minimized state - just a small floating pill
    if (!isExpanded) {
        return (
            <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe pointer-events-none">
                <div className="flex justify-center mb-3 pointer-events-auto">
                    <button
                        onClick={() => setIsExpanded(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full border border-white/20 bg-black/70 backdrop-blur-xl text-white/80 text-xs font-medium shadow-lg shadow-black/30 hover:bg-black/80 transition-all active:scale-95"
                    >
                        <ChevronUp className="h-3.5 w-3.5" />
                        <span>Menu</span>
                    </button>
                </div>
            </div>
        );
    }

    // Expanded state - full nav bar
    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe animate-in slide-in-from-bottom-4 duration-200">
            <div className="mx-4 mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/70 backdrop-blur-xl px-2 py-1.5 shadow-lg shadow-black/20">
                <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-white">
                            <Menu className="h-5 w-5" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 border-r border-white/10 bg-background/80 backdrop-blur-xl w-[300px] [&>button]:hidden">
                        <Sidebar onNavigate={() => { setSidebarOpen(false); setIsExpanded(false); }} />
                    </SheetContent>
                </Sheet>

                <Link href="/" prefetch onClick={() => setIsExpanded(false)}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-white"
                    >
                        <MessageSquare className="h-5 w-5" />
                    </Button>
                </Link>

                <Button
                    variant="default"
                    size="icon"
                    className="h-11 w-11 rounded-full bg-primary shadow-lg shadow-primary/30"
                    onClick={handleNewChat}
                >
                    <Plus className="h-5 w-5" />
                </Button>

                <Link href="/settings" prefetch onClick={() => setIsExpanded(false)}>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-white"
                    >
                        <Settings className="h-5 w-5" />
                    </Button>
                </Link>

                {/* Close/minimize button */}
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-white"
                    onClick={() => setIsExpanded(false)}
                >
                    <X className="h-5 w-5" />
                </Button>
            </div>
        </div>
    );
}
