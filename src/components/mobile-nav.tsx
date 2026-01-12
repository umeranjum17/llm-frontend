"use client";

import Link from "next/link";
import { MessageSquare, Plus, Settings, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useState } from "react";

export function MobileNav() {
    const [open, setOpen] = useState(false);

    const handleNewChat = () => {
        const event = new CustomEvent("lumina:new-chat");
        window.dispatchEvent(event);
    };

    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden pb-safe">
            <div className="mx-4 mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-black/60 backdrop-blur-xl px-2 py-1.5 shadow-lg shadow-black/20">
                <Sheet open={open} onOpenChange={setOpen}>
                    <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-white">
                            <Menu className="h-5 w-5" />
                        </Button>
                    </SheetTrigger>
                    <SheetContent side="left" className="p-0 border-r border-white/10 bg-background/80 backdrop-blur-xl w-[300px]">
                        <Sidebar />
                    </SheetContent>
                </Sheet>

                <Link href="/" prefetch>
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

                <Link href="/settings" prefetch>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-xl text-muted-foreground hover:bg-white/10 hover:text-white"
                    >
                        <Settings className="h-5 w-5" />
                    </Button>
                </Link>

                <div className="w-10" /> {/* Spacer for visual balance */}
            </div>
        </div>
    );
}
