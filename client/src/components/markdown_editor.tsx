import Editor from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useColorMode } from "../utils/darkModeUtils";
import { Markdown } from "./markdown";

interface MarkdownEditorProps {
  content: string;
  setContent: (content: string) => void;
  placeholder?: string;
  height?: string;
  fontFamily?: string;
}

export function MarkdownEditor({
  content,
  setContent,
  placeholder = "> Write your content here...",
  height = "400px",
  fontFamily = "Sarasa Mono SC, JetBrains Mono, monospace"
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const colorMode = useColorMode();
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const isComposingRef = useRef(false);
  const [preview, setPreview] = useState<'edit' | 'preview' | 'comparison'>('edit');

  // 通用样式插入逻辑
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
    };

    const [before, after] = styles[type];
    const selectedText = model.getValueInRange(selection);
    editor.executeEdits("style", [{ range: selection, text: `${before}${selectedText}${after}`, forceMoveMarkers: true }]);
    editor.focus();
  };

  // --- 核心：颜色、高亮、格式清理逻辑 ---
  const applySpanStyle = (styleStr: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);
    if (!selectedText) return;

    editor.executeEdits("span-style", [{
      range: selection,
      text: `<span style="${styleStr}">${selectedText}</span>`,
      forceMoveMarkers: true
    }]);
    editor.focus();
  };

  const removeFormatting = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);
    const cleanText = selectedText.replace(/<span[^>]*>([\s\S]*?)<\/span>/g, '$1');
    
    editor.executeEdits("remove-format", [{
      range: selection,
      text: cleanText,
      forceMoveMarkers: true
    }]);
    editor.focus();
  };

  const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    editor.onDidChangeModelContent(() => {
      if (!isComposingRef.current) setContent(editor.getValue());
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {/* 视图切换按钮 */}
      <div className="flex flex-row space-x-2 border-b pb-2 dark:border-zinc-800">
        {['edit', 'preview', 'comparison'].map((m) => (
          <button 
            key={m} 
            className={`px-3 py-1 text-sm rounded-md transition-colors ${preview === m ? "bg-theme text-white" : "hover:bg-gray-100 dark:hover:bg-zinc-800"}`} 
            onClick={() => setPreview(m as any)}
          >
            {t(m) || m}
          </button>
        ))}
      </div>

      <div className={`grid grid-cols-1 ${preview === 'comparison' ? "lg:grid-cols-2" : ""} gap-4`}>
        {/* 编辑器主体 */}
        <div className={preview === 'preview' ? "hidden" : "flex flex-col"}>
          
          {/* 工具栏 - 包含颜色和高亮按钮 */}
          <div className="flex flex-wrap items-center gap-2 mb-2 p-2 bg-gray-50 dark:bg-zinc-900/50 rounded-lg border dark:border-zinc-800">
            <button onClick={() => applyStyle('bold')} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded" title="加粗"><i className="ri-bold" /></button>
            <button onClick={() => applyStyle('italic')} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded" title="斜体"><i className="ri-italic" /></button>
            
            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />

            {/* 1. 字体颜色选择器 */}
            <div className="flex items-center gap-1 group relative">
              <input 
                type="color" 
                title="字体颜色" 
                className="w-6 h-6 p-0 border border-gray-300 dark:border-zinc-600 rounded cursor-pointer bg-transparent" 
                onChange={(e) => applySpanStyle(`color: ${e.target.value}`)} 
              />
            </div>

            {/* 2. 黄色高亮按钮 */}
            <button 
              onClick={() => applySpanStyle('background-color: #ffff00; color: #000')} 
              className="p-1 bg-yellow-200 hover:bg-yellow-300 rounded text-black flex items-center justify-center" 
              title="黄色高亮"
            >
              <i className="ri-mark-pen-line text-sm" />
            </button>

            {/* 3. 清除样式按钮 */}
            <button 
              onClick={removeFormatting} 
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded" 
              title="清除颜色与局部字体"
            >
              <i className="ri-format-clear" />
            </button>

            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />

            {/* 局部字体选择 */}
            <select 
              className="bg-transparent text-xs font-bold text-theme outline-none cursor-pointer"
              onChange={(e) => { 
                if(e.target.value) applySpanStyle(`font-family: ${e.target.value}`); 
                e.target.value = ""; 
              }}
            >
              <option value="">{t("local_font") || "局部字体"}</option>
              <option value="'Ma Shan Zheng', cursive">楷体</option>
              <option value="'Noto Serif SC', serif">宋体</option>
              <option value="'Zhi Mang Xing', cursive">手写体</option>
            </select>
          </div>

          <div className="border rounded-xl overflow-hidden dark:border-zinc-800 shadow-inner">
            <Editor 
              onMount={handleEditorMount} 
              height={height} 
              defaultLanguage="markdown" 
              value={content} 
              theme={colorMode === "dark" ? "vs-dark" : "light"}
              options={{ 
                wordWrap: "on", 
                fontFamily, 
                minimap: { enabled: false }, 
                automaticLayout: true,
                lineNumbers: "on",
                padding: { top: 10 }
              }} 
            />
          </div>
        </div>
        
        {/* 预览区 */}
        <div className={`px-4 py-2 overflow-y-auto border rounded-xl dark:border-zinc-800 bg-white dark:bg-zinc-950 ${preview === 'edit' ? "hidden" : ""}`} style={{ height }}>
          <Markdown content={content || placeholder} />
        </div>
      </div>
    </div>
  );
}
