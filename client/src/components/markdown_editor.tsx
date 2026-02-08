import Editor from '@monaco-editor/react';
import { editor, Selection } from 'monaco-editor';
import React, { useRef, useState } from "react";
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
  fontFamily?: string;
}

export function MarkdownEditor({
  content,
  setContent,
  placeholder = "> Write your content here...",
  height = "400px",
  fontFamily: defaultFontFamily = "Sarasa Mono SC, JetBrains Mono, monospace"
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const colorMode = useColorMode();
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const isComposingRef = useRef(false); 
  const [preview, setPreview] = useState<'edit' | 'preview' | 'comparison'>('edit');
  const [uploading, setUploading] = useState(false);
  const [currentFont, setCurrentFont] = useState(defaultFontFamily);

  const fontOptions = [
    { name: "等宽 (默认)", value: "Sarasa Mono SC, JetBrains Mono, monospace" },
    { name: "代码连字 (Fira Code)", value: "'Fira Code', monospace" },
    { name: "思源宋体 (Noto Serif SC)", value: "'Noto Serif SC', serif" },
    { name: "马善政毛笔", value: "'Ma Shan Zheng', cursive" },
    { name: "之芒行书", value: "'Zhi Mang Xing', cursive" },
  ];

  function uploadImage(file: File, onSuccess: (url: string) => void, showAlert: (msg: string) => void) {
    client.storage.index.post({ key: file.name, file: file }, { headers: headersWithAuth() })
      .then(({ data, error }) => {
        if (error) showAlert(t("upload.failed"));
        if (data) onSuccess(data);
      }).catch(() => showAlert(t("upload.failed")));
  }

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboardData = event.clipboardData;
    if (clipboardData.files.length === 1) {
      const editor = editorRef.current;
      if (!editor) return;
      setUploading(true);
      const myfile = clipboardData.files[0] as File;
      uploadImage(myfile, (url) => {
        const selection = editor.getSelection();
        if (selection) editor.executeEdits(undefined, [{ range: selection, text: `![${myfile.name}](${url})\n` }]);
        setUploading(false);
      }, () => setUploading(false));
    }
  };

  // --- 核心改进：智能样式切换逻辑 (类似 Word) ---
  const applyStyle = (type: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);
    
    // 定义每种样式的匹配规则
    const styleMap: Record<string, { before: string; after: string; reg: RegExp }> = {
      bold: { before: '**', after: '**', reg: /^\*\*([\s\S]*)\*\*$/ },
      italic: { before: '*', after: '*', reg: /^\*([\s\S]*)\*$/ },
      underline: { before: '<u>', after: '</u>', reg: /^<u>([\s\S]*)<\/u>$/ },
      strikethrough: { before: '~~', after: '~~', reg: /^~~([\s\S]*)~~$/ },
      sup: { before: '<sup>', after: '</sup>', reg: /^<sup>([\s\S]*)<\/sup>$/ },
      sub: { before: '<sub>', after: '</sub>', reg: /^<sub>([\s\S]*)<\/sub>$/ },
    };

    const style = styleMap[type];
    if (!style) return;

    let newText = "";
    // 检测是否已经应用了该样式
    if (style.reg.test(selectedText)) {
      // 已经存在样式，则“反选”（剥离标签）
      newText = selectedText.replace(style.reg, '$1');
    } else {
      // 不存在样式，则包裹标签
      newText = `${style.before}${selectedText}${style.after}`;
    }

    editor.executeEdits("style", [{ 
      range: selection, 
      text: newText, 
      forceMoveMarkers: true 
    }]);
    
    // 如果之前是选中状态，重新选中处理后的文本
    if (!selection.isEmpty()) {
        const lineCount = newText.split('\n').length - 1;
        const lastLineLen = newText.split('\n').pop()?.length || 0;
        const endLineNumber = selection.startLineNumber + lineCount;
        const endColumn = lineCount === 0 ? selection.startColumn + newText.length : lastLineLen + 1;
        editor.setSelection(new Selection(selection.startLineNumber, selection.startColumn, endLineNumber, endColumn));
    }
    
    editor.focus();
  };

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
    const selection = editor.getSelection();
    if (selection) {
      editor.executeEdits("table", [{ range: selection, text: tableMd.trim(), forceMoveMarkers: true }]);
      editor.focus();
    }
  };

  const applySpanStyle = (styleStr: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model || !model.getValueInRange(selection)) return;
    editor.executeEdits("span-style", [{ range: selection, text: `<span style="${styleStr}">${model.getValueInRange(selection)}</span>`, forceMoveMarkers: true }]);
    editor.focus();
  };

  const removeFormatting = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;
    const cleanText = model.getValueInRange(selection).replace(/<[^>]*>/g, '').replace(/(\*\*|\*|~~)/g, '');
    editor.executeEdits("remove-format", [{ range: selection, text: cleanText, forceMoveMarkers: true }]);
    editor.focus();
  };

  function UploadImageButton() {
    const uploadRef = useRef<HTMLInputElement>(null);
    return (
      <button onClick={() => uploadRef.current?.click()} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme" title="上传图片">
        <input ref={uploadRef} className="hidden" type="file" accept="image/*" onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (file) {
            setUploading(true);
            uploadImage(file, (url) => {
              setUploading(false);
              const sel = editorRef.current?.getSelection() || new Selection(1,1,1,1);
              editorRef.current?.executeEdits(undefined, [{ range: sel, text: `![${file.name}](${url})\n` }]);
            }, () => setUploading(false));
          }
        }} />
        <i className="ri-image-add-line" />
      </button>
    );
  }

  const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    const inputElement = editor.getDomNode()?.querySelector('textarea');
    if (inputElement) {
      inputElement.addEventListener('compositionstart', () => { isComposingRef.current = true; });
      inputElement.addEventListener('compositionend', () => {
        isComposingRef.current = false;
        setContent(editor.getValue());
      });
    }
    editor.onDidChangeModelContent(() => {
      if (!isComposingRef.current) { setContent(editor.getValue()); }
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center space-x-2 border-b pb-2 dark:border-zinc-800">
        {['edit', 'preview', 'comparison'].map((m) => (
          <button key={m} className={`px-3 py-1 text-xs rounded-md transition-all ${preview === m ? "bg-theme text-white shadow-md" : "hover:bg-gray-100 dark:hover:bg-zinc-800"}`} onClick={() => setPreview(m as any)}>
            {t(m) || m}
          </button>
        ))}
        <div className="flex-grow" />
        {uploading && <Loading type="spin" color="#FC466B" height={16} width={16} />}
      </div>

      <div className={`grid grid-cols-1 ${preview === 'comparison' ? "lg:grid-cols-2" : ""} gap-4`}>
        <div className={preview === 'preview' ? "hidden" : "flex flex-col"}>
          <div className="flex flex-wrap items-center gap-y-2 gap-x-1 mb-2 p-2 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border dark:border-zinc-800">
            <UploadImageButton />
            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            <select value={currentFont} onChange={(e) => setCurrentFont(e.target.value)} className="text-xs bg-transparent border border-gray-300 dark:border-zinc-700 rounded px-1 py-1 focus:outline-none dark:text-white">
              {fontOptions.map(f => <option key={f.value} value={f.value} className="dark:bg-zinc-900">{f.name}</option>)}
            </select>
            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            <button onClick={() => applyStyle('bold')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="加粗"><i className="ri-bold" /></button>
            <button onClick={() => applyStyle('italic')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="斜体"><i className="ri-italic" /></button>
            <button onClick={() => applyStyle('underline')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="下划线"><i className="ri-underline" /></button>
            <button onClick={() => applyStyle('strikethrough')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="中划线"><i className="ri-strikethrough" /></button>
            <button onClick={insertTable} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="插入表格"><i className="ri-table-line" /></button>
            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            <button onClick={() => applyStyle('sup')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="上标"><i className="ri-superscript" /></button>
            <button onClick={() => applyStyle('sub')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="下标"><i className="ri-subscript" /></button>
            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            <button onClick={() => applySpanStyle('background-color: #ffff00; color: #000')} className="p-1.5 bg-yellow-200 hover:bg-yellow-300 rounded text-black" title="黄色高亮"><i className="ri-mark-pen-line" /></button>
            <button onClick={removeFormatting} className="p-1.5 hover:bg-red-100 text-red-500 rounded" title="清除格式"><i className="ri-format-clear" /></button>
          </div>

          <div className="border rounded-xl overflow-hidden dark:border-zinc-800 bg-white dark:bg-[#1e1e1e]" onPaste={handlePaste}>
            <Editor onMount={handleEditorMount} height={height} defaultLanguage="markdown" value={content} theme={colorMode === "dark" ? "vs-dark" : "light"}
              options={{ wordWrap: "on", fontFamily: currentFont, fontLigatures: true, fontSize: 14, minimap: { enabled: false }, automaticLayout: true, lineNumbers: "on", padding: { top: 10 } }} 
            />
          </div>
        </div>
        <div className={`px-4 py-2 overflow-y-auto border rounded-xl dark:border-zinc-800 bg-white dark:bg-zinc-950 ${preview === 'edit' ? "hidden" : ""}`} style={{ height }}>
          <Markdown content={content || placeholder} />
        </div>
      </div>
    </div>
  );
}
