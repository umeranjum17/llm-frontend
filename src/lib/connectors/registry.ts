import { Connector, ConnectorId } from "./types";

// Registry of all available connectors
export const availableConnectors: Connector[] = [
    // Add connectors here (e.g. GitHub, Google Drive, Notion)
];

export function getConnector(id: ConnectorId | string): Connector | undefined {
    return availableConnectors.find((c) => c.id === id);
}
