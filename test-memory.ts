// Quick test: Open browser console and run this to check memory

import { getMemoryContext } from '@/lib/memory';

async function testMemory() {
    console.log("=== MEMORY DEBUG TEST ===");
    const context = await getMemoryContext("Do you know my name?");
    console.log("Memory context result:", context);
    if (!context) {
        console.error("NO MEMORY CONTEXT RETURNED!");
    }
}

// Run in browser console:
// testMemory();
