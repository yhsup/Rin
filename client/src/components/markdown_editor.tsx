import Editor from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import React, { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import Loading from 'react-loading';
import { useColorMode } from "../utils/darkModeUtils";
import { Markdown } from "./markdown";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";

interface MarkdownEditorProps {
  content: string;
  setContent: (content: string) => void;
  placeholder?: string;
  height?: string;
  fontSize?: number;
  lineHeight?: number;
  fontFamily?: string;
}

export function MarkdownEditor({
  content,
  setContent,
  placeholder = "> Write your content here...",
  height = "400px",
  fontSize = 14,
  lineHeight = 21,
  fontFamily = "Sarasa Mono SC, JetBrains Mono, monospace"
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const colorMode = useColorMode();
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const decorationsRef = useRef<string[]>([]);
  const isComposingRef = useRef(false);
  const [preview, setPreview] = useState<'edit' | 'preview' | 'comparison'>('edit');
  const [uploading, setUploading] = useState(false);

  /* ---------------- 样式应用逻辑 ---------------- */
  const applyStyle = (type: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const styles: Record<string, [string, string]> = {
      bold: ['**', '**'],
      italic: ['*', '*'],
      underline: ['<u>', '</u>'],
      strikethrough: ['~~', '~~'],
      sup: ['<sup>', '</sup>'],
      sub: ['<sub>', '</sub>'],
    };

    const [before, after] = styles[type];
    const selectedText = model.getValueInRange(selection);

    editor.executeEdits("style-applier", [{
      range: selection,
      text: `${before}${selectedText}${after}`,
      forceMoveMarkers: true
    }]);

    if (selectedText === "") {
      const pos = editor.getPosition();
      if (pos) editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column - after.length });
    }
    editor.focus();
  };

  /* ---------------- 局部字体应用 ---------------- */
  const applyFontFamily = (font: string) => {
    const editor = editorRef.current;
    if (!editor || !font) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);
    if (selectedText === "") return;

    editor.executeEdits("font-applier", [{
      range: selection,
      text: `<span style="font-family: ${font}">${selectedText}</span>`,
      forceMoveMarkers: true
    }]);
    editor.focus();
  };

  /* ---------------- 编辑器实时装饰逻辑 (实时预览字体) ---------------- */
  const updateFontDecorations = (editor: editor.IStandaloneCodeEditor, monaco: any) => {
    const model = editor.getModel();
    if (!model) return;

    const value = model.getValue();
    const newDecorations: editor.IModelDeltaDecoration[] = [];
    const regex = /<span style="font-family: ([^"]+)">([\s\S]*?)<\/span>/g;
    let match;

    while ((match = regex.exec(value)) !== null) {
      const startPos = model.getPositionAt(match.index);
      const endPos = model.getPositionAt(match.index + match[0].length);
      const fontName = match[1].replace(/['"]/g, '').trim();
      const className = `monaco-font-${fontName.replace(/\s+/g, '-')}`;

      if (!document.getElementById(className)) {
        const style = document.createElement('style');
        style.id = className;
        style.innerHTML = `.${className} { font-family: "${fontName}" !important; }`;
        document.head.appendChild(style);
      }

      newDecorations.push({
        range: new monaco.Range(startPos.lineNumber, startPos.column, endPos.lineNumber, endPos.column),
        options: { inlineClassName: className }
      });
    }
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, newDecorations);
  };

  /* ---------------- 生命周期与事件 ---------------- */
  const handleEditorMount = (editor: editor.IStandaloneCodeEditor, monaco: any) => {
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => applyStyle('bold'));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => applyStyle('italic'));
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, () => applyStyle('underline'));

    editor.onDidCompositionStart(() => { isComposingRef.current = true; });
    editor.onDidCompositionEnd(() => {
      isComposingRef.current = false;
      setContent(editor.getValue());
      updateFontDecorations(editor, monaco);
    });

    editor.onDidChangeModelContent(() => {
      if (!isComposingRef.current) {
        setContent(editor.getValue());
        updateFontDecorations(editor, monaco);
      }
    });

    updateFontDecorations(editor, monaco);
  };

  /* ---------------- 图片上传 (简略版，同之前) ---------------- */
  function uploadImage(file: File, onSuccess: (url: string) => void) {
    client.storage.index.post({ key: file.name, file: file }, { headers: headersWithAuth() })
      .then(({ data }) => { if (data) onSuccess(data); });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row space-x-2 border-b pb-2 dark:border-zinc-800">
        <button className={`px-2 py-1 rounded ${preview === 'edit' ? "bg-theme text-white" : ""}`} onClick={() => setPreview('edit')}>编辑</button>
        <button className={`px-2 py-1 rounded ${preview === 'preview' ? "bg-theme text-white" : ""}`} onClick={() => setPreview('preview')}>预览</button>
        <button className={`px-2 py-1 rounded ${preview === 'comparison' ? "bg-theme text-white" : ""}`} onClick={() => setPreview('comparison')}>分屏</button>
      </div>

      <div className={`grid grid-cols-1 ${preview === 'comparison' ? "sm:grid-cols-2" : ""}`}>
        <div className={preview === 'preview' ? "hidden" : "flex flex-col"}>
          {/* 样式工具栏 */}
          <div className="flex flex-wrap items-center gap-2 mb-2 p-1 bg-gray-50 dark:bg-zinc-900/50 rounded border dark:border-zinc-800">
            <button onClick={() => applyStyle('bold')} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"><i className="ri-bold" /></button>
            <button onClick={() => applyStyle('italic')} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"><i className="ri-italic" /></button>
            <button onClick={() => applyStyle('underline')} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"><i className="ri-underline" /></button>
            <button onClick={() => applyStyle('strikethrough')} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"><i className="ri-strikethrough" /></button>
            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700" />
            <select 
              className="bg-transparent text-[11px] font-bold text-theme outline-none cursor-pointer"
              onChange={(e) => { applyFontFamily(e.target.value); e.target.value = ""; }}
            >
              <option value="">局部字体</option>
              <option value="Ma Shan Zheng">楷体</option>
              <option value="Noto Serif SC">宋体</option>
              <option value="Zhi Mang Xing">手写</option>
              <option value="JetBrains Mono">代码体</option>
            </select>
          </div>

          <div className="border rounded-lg overflow-hidden dark:border-zinc-800">
            <Editor
              onMount={handleEditorMount}
              height={height}
              defaultLanguage="markdown"
              value={content}
              theme={colorMode === "dark" ? "vs-dark" : "light"}
              options={{
                wordWrap: "on",
                fontSize,
                lineHeight,
                fontFamily,
                minimap: { enabled: false },
                automaticLayout: true,
                scrollbar: { vertical: 'auto' }
              }}
            />
          </div>
        </div>
        <div className={`px-4 overflow-y-auto border-l dark:border-zinc-800 ${preview === 'edit' ? "hidden" : ""}`} style={{ height }}>
          <Markdown content={content || placeholder} />
        </div>
      </div>
    </div>
  );
}
