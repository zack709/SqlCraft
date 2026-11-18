import { useEffect, useRef } from "react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/editor/editor.worker?worker";

import { useWorkbenchStore } from "../store/workbenchStore";
import type { DbKind } from "../types/database";

if (typeof self !== "undefined" && !(self as unknown as { MonacoEnvironment?: unknown }).MonacoEnvironment) {
  (self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = {
    getWorker() {
      return new editorWorker();
    },
  };
}

export interface SchemaCompletionTable {
  name: string;
  comment?: string | null;
  columns?: { name: string; columnType: string }[];
}

interface MonacoSqlEditorProps {
  value: string;
  dbKind: DbKind;
  tables: SchemaCompletionTable[];
  views: string[];
  routines: string[];
  onChange: (value: string) => void;
  onRunAll: () => void;
  onRunSelection: (selectedText: string, cursorOffset: number) => void;
  onFormat: () => void;
  onSelectionChange?: (selectedText: string, cursorOffset: number) => void;
}

const COMMON_SQL_KEYWORDS = [
  "SELECT",
  "FROM",
  "WHERE",
  "INSERT INTO",
  "VALUES",
  "UPDATE",
  "SET",
  "DELETE FROM",
  "JOIN",
  "LEFT JOIN",
  "INNER JOIN",
  "GROUP BY",
  "HAVING",
  "ORDER BY",
  "LIMIT",
  "OFFSET",
  "DISTINCT",
  "COUNT(*)",
  "COALESCE",
  "CREATE TABLE",
  "ALTER TABLE",
  "EXPLAIN",
];

function dialectToLanguageId(kind: DbKind): "mysql" | "pgsql" {
  return kind === "postgres" ? "pgsql" : "mysql";
}

export function MonacoSqlEditor({
  value,
  dbKind,
  tables,
  views,
  routines,
  onChange,
  onRunAll,
  onRunSelection,
  onFormat,
  onSelectionChange,
}: MonacoSqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const { theme, editorFontSize } = useWorkbenchStore();
  const latestPropsRef = useRef({
    tables,
    views,
    routines,
    onChange,
    onRunAll,
    onRunSelection,
    onFormat,
    onSelectionChange,
  });

  latestPropsRef.current = {
    tables,
    views,
    routines,
    onChange,
    onRunAll,
    onRunSelection,
    onFormat,
    onSelectionChange,
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const lang = dialectToLanguageId(dbKind);
    const editor = monaco.editor.create(el, {
      value,
      language: lang,
      theme: theme === "dark" ? "vs-dark" : "vs",
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: editorFontSize,
      fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
      lineNumbersMinChars: 3,
      scrollBeyondLastLine: false,
      wordWrap: "on",
      tabSize: 2,
      suggestOnTriggerCharacters: true,
    });

    editorRef.current = editor;

    const changeSub = editor.onDidChangeModelContent(() => {
      latestPropsRef.current.onChange(editor.getValue());
    });

    const selectionSub = editor.onDidChangeCursorSelection(() => {
      const model = editor.getModel();
      const sel = editor.getSelection();
      if (!model || !sel) return;
      const selected = model.getValueInRange(sel);
      const offset = model.getOffsetAt(sel.getPosition());
      latestPropsRef.current.onSelectionChange?.(selected, offset);
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      const model = editor.getModel();
      const sel = editor.getSelection();
      if (!model || !sel) {
        latestPropsRef.current.onRunAll();
        return;
      }
      const selected = model.getValueInRange(sel);
      const offset = model.getOffsetAt(sel.getPosition());
      latestPropsRef.current.onRunSelection(selected, offset);
    });

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
      () => {
        latestPropsRef.current.onFormat();
      }
    );

    return () => {
      changeSub.dispose();
      selectionSub.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  // Sync external value changes (e.g. Format SQL button)
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getValue() !== value) {
      editor.setValue(value);
    }
  }, [value]);

  // Switch language dialect dynamically
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) return;
    monaco.editor.setModelLanguage(model, dialectToLanguageId(dbKind));
  }, [dbKind]);

  // Sync theme (vs / vs-dark) and fontSize dynamically
  useEffect(() => {
    monaco.editor.setTheme(theme === "dark" ? "vs-dark" : "vs");
  }, [theme]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.updateOptions({ fontSize: editorFontSize });
  }, [editorFontSize]);

  // Register Schema-aware autocomplete provider per language
  useEffect(() => {
    const lang = dialectToLanguageId(dbKind);
    const provider = monaco.languages.registerCompletionItemProvider(lang, {
      triggerCharacters: [".", " "],
      provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position) {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const linePrefix = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const dotMatch = linePrefix.match(/([A-Za-z0-9_]+)\.\w*$/);
        const { tables: tbls, views: vws, routines: rtns } = latestPropsRef.current;

        const suggestions: monaco.languages.CompletionItem[] = [];

        if (dotMatch) {
          const prefixIdent = dotMatch[1].toLowerCase();
          const matchedTbl = tbls.find((t) => t.name.toLowerCase() === prefixIdent);
          const cols = matchedTbl?.columns ?? tbls.flatMap((t) => t.columns ?? []);
          for (const col of cols) {
            suggestions.push({
              label: col.name,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: col.columnType,
              insertText: col.name,
              range,
            });
          }
          return { suggestions };
        }

        for (const t of tbls) {
          suggestions.push({
            label: t.name,
            kind: monaco.languages.CompletionItemKind.Struct,
            detail: t.comment ? `Table — ${t.comment}` : "Table",
            insertText: t.name,
            range,
          });
          for (const c of t.columns ?? []) {
            suggestions.push({
              label: c.name,
              kind: monaco.languages.CompletionItemKind.Field,
              detail: `${t.name}.${c.name} (${c.columnType})`,
              insertText: c.name,
              range,
            });
          }
        }

        for (const v of vws) {
          suggestions.push({
            label: v,
            kind: monaco.languages.CompletionItemKind.Interface,
            detail: "View",
            insertText: v,
            range,
          });
        }

        for (const r of rtns) {
          suggestions.push({
            label: r,
            kind: monaco.languages.CompletionItemKind.Function,
            detail: "Routine",
            insertText: `${r}()`,
            range,
          });
        }

        for (const kw of COMMON_SQL_KEYWORDS) {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            detail: "SQL",
            insertText: kw,
            range,
          });
        }

        return { suggestions };
      },
    });

    return () => provider.dispose();
  }, [dbKind, tables, views, routines]);

  return <div ref={containerRef} className="h-full w-full" />;
}
