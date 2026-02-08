import Editor from '@monaco-editor/react';
import { editor, Selection } from 'monaco-editor';
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
  fontFamily?: string;
}

export function MarkdownEditor({
  content,
  setContent,
  placeholder = "> Write your content here...",
  height = "400px",
  fontFamily = "ui-monospace, SFMono-Regular, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace"
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const colorMode = useColorMode();
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const isComposingRef = useRef(false); 
  const [preview, setPreview] = useState<'edit' | 'preview' | 'comparison'>('edit');
  const [uploading, setUploading] = useState(false);

  // --- 数学符号模板定义 ---
  const mathSymbols = [
    { label: "行内公式容器", value: "$公式$", placeholder: "公式" },
    { label: "块级公式容器", value: "\n$$\n公式内容\n$$\n", placeholder: "公式内容" },
    { label: "分式 (frac)", value: "$\\frac{分子}{分母}$", placeholder: "分子" },
    { label: "定积分 (int)", value: "$\\int_{下限}^{上限} f(x) dx$", placeholder: "下限" },
    { label: "根号 (sqrt)", value: "$\\sqrt{内容}$", placeholder: "内容" },
    { label: "求和 (sum)", value: "$\\sum_{i=1}^{n}$", placeholder: "n" },
    { label: "乘法 (times)", value: "$\\times$", placeholder: "" },
    { label: "希腊字母 (π)", value: "$\\pi$", placeholder: "" },
  ];

  // --- 核心逻辑：插入模板并防止 $ 符号重复 ---
  const insertMathTemplate = (template: string, placeholder?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);
    let textToInsert = template;

    // 检测是否正在替换“公式”或“公式内容”占位符
    const isReplacingPlaceholder = selectedText === "公式" || selectedText === "公式内容";
    
    // 如果正在替换容器占位符，剥离模板自带的边界符 $
    if (isReplacingPlaceholder) {
      textToInsert = template.replace(/^\$/, '').replace(/\$$/, '');
    }

    // 如果选中了普通文字（非容器占位符），则将文字填入模板占位符中
    if (selectedText && placeholder && !isReplacingPlaceholder) {
      textToInsert = template.replace(placeholder, selectedText);
    }

    editor.executeEdits("insert-math", [{
      range: selection,
      text: textToInsert,
      forceMoveMarkers: true
    }]);

    // 自动高亮新模板的占位符
    if ((!selectedText || isReplacingPlaceholder) && placeholder) {
      const position = editor.getPosition();
      if (position) {
        const lines = textToInsert.split('\n');
        if (lines.length === 1) {
          const pIdx = textToInsert.indexOf(placeholder);
          const startCol = position.column - (textToInsert.length - pIdx);
          editor.setSelection(new Selection(position.lineNumber, startCol, position.lineNumber, startCol + placeholder.length));
        } else {
          const pIdx = textToInsert.indexOf(placeholder);
          const beforePlaceholder = textToInsert.substring(0, pIdx);
          const linesBefore = beforePlaceholder.split('\n');
          const targetLineNumber = (position.lineNumber - lines.length + 1) + linesBefore.length - 1;
          const targetColumn = linesBefore[linesBefore.length - 1].length + 1;
          editor.setSelection(new Selection(targetLineNumber, targetColumn, targetLineNumber, targetColumn + placeholder.length));
        }
      }
    }
    editor.focus();
  };

  // --- 公式下拉按钮 ---
  function MathFormulaButton() {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
      <div className="relative" ref={menuRef}>
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          className={`p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white flex items-center gap-1 transition-colors ${isOpen ? 'bg-gray-200 dark:bg-zinc-700' : ''}`}
        >
          <i className="ri-functions" />
          <i className="ri-arrow-down-s-line text-[10px]" />
        </button>
        {isOpen && (
          <div className="absolute left-0 top-full mt-1 z-50 w-48 bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-lg shadow-xl py-1 overflow-hidden">
            {mathSymbols.map((sym) => (
              <button
                key={sym.label}
                className="w-full px-3 py-2 text-left text-xs hover:bg-theme hover:text-white dark:text-gray-300 transition-colors"
                onClick={() => {
                  insertMathTemplate(sym.value, sym.placeholder);
                  setIsOpen(false);
                }}
              >
                {sym.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- 图片上传与粘贴 ---
  const uploadImage = (file: File, onSuccess: (url: string) => void) => {
    client.storage.index.post({ key: file.name, file: file }, { headers: headersWithAuth() })
      .then(({ data, error }) => {
        if (data) onSuccess(data);
        if (error) console.error("Upload failed");
      }).catch(() => console.error("Upload error"));
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const files = event.clipboardData.files;
    if (files.length === 1) {
      setUploading(true);
      uploadImage(files[0], (url) => {
        const sel = editorRef.current?.getSelection();
        if (sel) editorRef.current?.executeEdits("img", [{ range: sel, text: `![image](${url})\n` }]);
        setUploading(false);
      });
    }
  };

  // --- 样式应用辅助函数 ---
  const applyStyle = (type: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;
    const selectedText = model.getValueInRange(selection);
    const styleMap: Record<string, { before: string; after: string; reg: RegExp }> = {
      bold: { before: '**', after: '**', reg: /^\*\*([\s\S]*)\*\*$/ },
      italic: { before: '*', after: '*', reg: /^\*([\s\S]*)\*$/ },
      underline: { before: '<u>', after: '</u>', reg: /^<u>([\s\S]*)<\/u>$/ },
      strikethrough: { before: '~~', after: '~~', reg: /^~~([\s\S]*)~~$/ },
      sup: { before: '<sup>', after: '</sup>', reg: /^<sup>([\s\S]*)<\/sup>$/ },
      sub: { before: '<sub>', after: '</sub>', reg: /^<sub>([\s\S]*)<\/sub>$/ },
    };
    const style = styleMap[type];
    const newText = style.reg.test(selectedText) ? selectedText.replace(style.reg, '$1') : `${style.before}${selectedText}${style.after}`;
    editor.executeEdits("style", [{ range: selection, text: newText, forceMoveMarkers: true }]);
    editor.focus();
  };

  const insertTable = () => {
    const input = window.prompt("Rows*Cols (e.g. 3*3):", "3*3");
    if (!input) return;
    const [rows, cols] = input.split('*').map(Number);
    if (isNaN(rows) || isNaN(cols)) return;
    let table = "| " + Array(cols).fill("Header").join(" | ") + " |\n| " + Array(cols).fill("---").join(" | ") + " |\n";
    for (let i = 0; i < rows; i++) table += "| " + Array(cols).fill("Content").join(" | ") + " |\n";
    const sel = editorRef.current?.getSelection();
    if (sel) editorRef.current?.executeEdits("table", [{ range: sel, text: table.trim() }]);
  };

  const removeFormatting = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const sel = editor.getSelection();
    const model = editor.getModel();
    if (!sel || !model) return;
    const cleanText = model.getValueInRange(sel).replace(/<[^>]*>/g, '').replace(/(\*\*|\*|~~)/g, '');
    editor.executeEdits("clean", [{ range: sel, text: cleanText }]);
  };

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
    editor.onDidChangeModelContent(() => { if (!isComposingRef.current) setContent(editor.getValue()); });
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
            <label className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme cursor-pointer">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setUploading(true);
                  uploadImage(file, (url) => {
                    const sel = editorRef.current?.getSelection() || new Selection(1,1,1,1);
                    editorRef.current?.executeEdits("img", [{ range: sel, text: `![img](${url})\n` }]);
                    setUploading(false);
                  });
                }
              }} />
              <i className="ri-image-add-line" />
            </label>
            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            <button onClick={() => applyStyle('bold')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white"><i className="ri-bold" /></button>
            <button onClick={() => applyStyle('italic')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white"><i className="ri-italic" /></button>
            <button onClick={() => applyStyle('underline')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white"><i className="ri-underline" /></button>
            <button onClick={() => applyStyle('strikethrough')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white"><i className="ri-strikethrough" /></button>
            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            <button onClick={insertTable} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white"><i className="ri-table-line" /></button>
            
            <MathFormulaButton />

            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            <button onClick={() => applyStyle('sup')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white"><i className="ri-superscript" /></button>
            <button onClick={() => applyStyle('sub')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white"><i className="ri-subscript" /></button>
            <button onClick={() => removeFormatting()} className="p-1.5 hover:bg-red-100 text-red-500 rounded"><i className="ri-format-clear" /></button>
          </div>

          <div className="border rounded-xl overflow-hidden bg-white dark:bg-[#1e1e1e]" onPaste={handlePaste}>
            <Editor onMount={handleEditorMount} height={height} defaultLanguage="markdown" value={content} theme={colorMode === "dark" ? "vs-dark" : "light"}
              options={{ wordWrap: "on", fontFamily: fontFamily, fontSize: 14, minimap: { enabled: false }, automaticLayout: true }} 
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
