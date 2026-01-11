export interface ArtifactFile {
    path: string;
    code: string;
    language: string;
}

export function parseArtifactFences(content: string): ArtifactFile[] {
    const files: ArtifactFile[] = [];

    // Regex to match code fences:
    // ```lang filename="path/to/file.ext"
    // ... code ...
    // ```
    // OR
    // ```lang filename=path/to/file.ext
    // ... code ...
    // ```
    // Also supports just `filename` without quotes
    const fenceRegex = /```(\w+)\s+(?:filename=["']?([^"'\n]+)["']?)?\s*\n([\s\S]*?)```/g;

    let match;
    while ((match = fenceRegex.exec(content)) !== null) {
        const language = match[1];
        const filename = match[2]; // Capturing group for filename
        const code = match[3];

        // Only include blocks that explicitely have a filename
        if (filename) {
            files.push({
                path: filename.trim(),
                language: language.trim(),
                code: code.replace(/\n$/, '') // Remove trailing newline
            });
        }
    }

    return files;
}
