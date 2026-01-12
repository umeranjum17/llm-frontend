import { McpManager } from "./mcp-manager";
import { McpServer } from "../db/schema";

async function main() {
    const manager = McpManager.getInstance();
    const server: McpServer = {
        id: "composio-test",
        name: "Composio Test",
        url: "https://backend.composio.dev/v3/mcp/e5462cbd-252b-4af7-a396-a4adb67bbb1f/mcp?user_id=pg-test-1076a694-4923-4e38-815b-8dae31bda4a6",
        apiKey: "",
        enabled: true,
        type: "sse",
        collection: "custom",
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    console.log("Connecting to Composio...");
    try {
        const { tools, metadata } = await manager.getTools([server]);
        const toolNames = Object.keys(tools);
        console.log(`Available tools: ${toolNames.join(", ")}`);

        const navigateToolName = toolNames.find(t => t.endsWith("BROWSER_TOOL_NAVIGATE"));
        if (!navigateToolName) {
            console.error("Navigate tool not found");
            return;
        }

        console.log(`Executing ${navigateToolName}...`);
        const result = await tools[navigateToolName].execute({
            url: "https://google.com"
        });

        console.log("Result:", JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("Error:", error);
    }
}

main().catch(console.error);
