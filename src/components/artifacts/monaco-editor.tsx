"use client";

import { useEffect, useRef } from "react";
import Editor, { Monaco } from "@monaco-editor/react";
import { useTheme } from "next-themes";

interface MonacoEditorProps {
  language: string;
  code: string;
  onChange?: (value: string | undefined) => void;
  readOnly?: boolean;
}

export function MonacoEditor({ language, code, onChange, readOnly = false }: MonacoEditorProps) {
  const { theme } = useTheme();
  const editorRef = useRef<any>(null);

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    
    // Configure editor options
    editor.updateOptions({
      minimap: { enabled: true },
      fontSize: 14,
      lineNumbers: "on",
      wordWrap: "on",
      automaticLayout: true,
      scrollBeyondLastLine: false,
      readOnly,
    });

    // Set up language-specific configurations
    if (language === "typescript" || language === "javascript") {
      monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monaco.languages.typescript.ScriptTarget.Latest,
        allowNonTsExtensions: true,
        moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.languages.typescript.ModuleKind.CommonJS,
        noEmit: true,
        esModuleInterop: true,
        jsx: monaco.languages.typescript.JsxEmit.React,
        reactNamespace: "React",
        allowJs: true,
        typeRoots: ["node_modules/@types"],
      });
    }
  };

  const editorTheme = theme === "dark" ? "vs-dark" : "light";

  return (
    <div className="h-full w-full">
      <Editor
        height="100%"
        language={language || "plaintext"}
        value={code}
        theme={editorTheme}
        onChange={onChange}
        onMount={handleEditorDidMount}
        options={{
          readOnly,
          minimap: { enabled: true },
          fontSize: 14,
          lineNumbers: "on",
          wordWrap: "on",
          automaticLayout: true,
          scrollBeyondLastLine: false,
          tabSize: 2,
          insertSpaces: true,
          formatOnPaste: true,
          formatOnType: true,
        }}
      />
    </div>
  );
}




