/**
 * MCP (Model Context Protocol) Plugin Types
 * Based on MCP specification for extensible tool integration
 */

export interface MCPTool {
  id: string;
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, MCPParameter>;
    required?: string[];
  };
}

export interface MCPParameter {
  type: "string" | "number" | "boolean" | "array" | "object";
  description: string;
  enum?: string[];
  items?: MCPParameter;
  properties?: Record<string, MCPParameter>;
}

export interface MCPPlugin {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  icon?: string;
  tools: MCPTool[];
  enabled: boolean;
  config?: Record<string, any>; // Plugin-specific configuration
}

export interface MCPPluginManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  icon?: string;
  tools: MCPTool[];
  requiresConfig?: {
    [key: string]: {
      type: "string" | "number" | "boolean";
      description: string;
      required: boolean;
    };
  };
}

export interface MCPExecutionContext {
  pluginId: string;
  toolId: string;
  parameters: Record<string, any>;
  config?: Record<string, any>;
}

export interface MCPExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}
