import { Connector, ConnectorId } from "./types";
import { notionConnector } from "./mock-notion";

// Registry of all available connectors
export const availableConnectors: Connector[] = [
    notionConnector,
    // Add more here (e.g. GitHub, Google Drive)
];

export function getConnector(id: ConnectorId | string): Connector | undefined {
    return availableConnectors.find((c) => c.id === id);
}
