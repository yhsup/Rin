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

  // 1. 基础样式插入 (Markdown 语法)
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

  // 2. 高级样式插入 (HTML Span 语法)
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

  // 3. 清除样式 (正则剥离 span)
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

  // 4. 表格插入
  const insertTable = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const input = window.prompt("请输入行列 (如 3*3):", "3*3");
    if (!input) return;
    const [rows, cols] = input.split('*').map(Number);
    if (isNaN(rows) || isNaN(cols)) return;

    let tableMd = "| " + Array(cols).fill("Header").join(" | ") + " |\n";
    tableMd += "| " + Array(cols).fill("---").join(" | ") + " |\n";
    for (let i = 0; i < rows; i++) {
      tableMd += "| " + Array(cols).fill("Content").join(" | ") + " |\n";
    }
    editor.executeEdits("table", [{ range: editor.getSelection()!, text: tableMd.trim(), forceMoveMarkers: true }]);
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
      {/* 视图模式切换 */}
      <div className="flex flex-row space-x-2 border-b pb-2 dark:border-zinc-800">
        {['edit', 'preview', 'comparison'].map((m) => (
          <button 
            key={m} 
            className={`px-3 py-1 text-xs rounded-md transition-all ${preview === m ? "bg-theme text-white shadow-md" : "hover:bg-gray-100 dark:hover:bg-zinc-800"}`} 
            onClick={() => setPreview(m as any)}
          >
            {t(m) || m}
          </button>
        ))}
      </div>

      <div className={`grid grid-cols-1 ${preview === 'comparison' ? "lg:grid-cols-2" : ""} gap-4`}>
        <div className={preview === 'preview' ? "hidden" : "flex flex-col"}>
          
          {/* 响应式工具栏：解决遮挡问题 */}
          <div className="flex flex-wrap items-center gap-y-2 gap-x-1 mb-2 p-2 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border dark:border-zinc-800">
            
            {/* 分组 1: 基础格式 */}
            <div className="flex items-center gap-1 pr-2 border-r dark:border-zinc-700">
              <button onClick={() => applyStyle('bold')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded" title="加粗"><i className="ri-bold" /></button>
              <button onClick={() => applyStyle('italic')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded" title="斜体"><i className="ri-italic" /></button>
              <button onClick={() => applyStyle('underline')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded" title="下划线"><i className="ri-underline" /></button>
              <button onClick={() => applyStyle('strikethrough')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded" title="中划线"><i className="ri-strikethrough" /></button>
            </div>

            {/* 分组 2: 颜色装饰 */}
            <div className="flex items-center gap-1 pr-2 border-r dark:border-zinc-700">
              <div className="flex items-center px-1" title="字体颜色">
                <input 
                  type="color" 
                  className="w-6 h-6 p-0 border border-gray-300 dark:border-zinc-600 rounded cursor-pointer bg-transparent" 
                  onChange={(e) => applySpanStyle(`color: ${e.target.value}`)} 
                />
              </div>
              <button 
                onClick={() => applySpanStyle('background-color: #ffff00; color: #000')} 
                className="p-1.5 bg-yellow-200 hover:bg-yellow-300 rounded text-black shadow-sm" 
                title="黄色高亮"
              >
                <i className="ri-mark-pen-line text-sm" />
              </button>
              <button 
                onClick={removeFormatting} 
                className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded" 
                title="清除格式"
              >
                <i className="ri-format-clear" />
              </button>
            </div>

            {/* 分组 3: 工具与字体 */}
            <div className="flex items-center gap-1">
              <button onClick={insertTable} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded" title="插入表格"><i className="ri-table-line" /></button>
              <select 
                className="bg-transparent text-[11px] font-bold text-theme outline-none cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-zinc-700 rounded px-1 h-7"
                onChange={(e) => { 
                  if(e.target.value) applySpanStyle(`font-family: ${e.target.value}`); 
                  e.target.value = ""; 
                }}
              >
                <option value="">{t("local_font") || "局部字体"}</option>
                <option value="'Ma Shan Zheng', cursive">楷体</option>
                <option value="'Noto Serif SC', serif">宋体</option>
                <option value="'Zhi Mang Xing', cursive">手写体</option>
                <option value="'Sarasa Mono SC', monospace">等宽</option>
              </select>
            </div>
          </div>

          {/* 编辑器区域 */}
          <div className="border rounded-xl overflow-hidden dark:border-zinc-800 shadow-sm bg-white dark:bg-[#1e1e1e]">
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
                padding: { top: 10, bottom: 10 },
                lineNumbers: "on",
                scrollbar: { verticalScrollbarSize: 8 }
              }} 
            />
          </div>
        </div>
        
        {/* 预览区域 */}
        <div className={`px-4 py-2 overflow-y-auto border rounded-xl dark:border-zinc-800 bg-white dark:bg-zinc-950 ${preview === 'edit' ? "hidden" : ""}`} style={{ height }}>
          <Markdown content={content || placeholder} />
        </div>
      </div>
    </div>
  );
}
