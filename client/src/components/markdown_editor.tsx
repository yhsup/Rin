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

  // --- 核心逻辑：插入模板并自动选中占位符 ---
  const insertMathTemplate = (template: string, placeholder?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);
    let textToInsert = template;

    // 如果用户已选中文字，则用选中的文字替换模板中的占位符
    if (selectedText && placeholder) {
      textToInsert = template.replace(placeholder, selectedText);
    }

    editor.executeEdits("insert-math", [{
      range: selection,
      text: textToInsert,
      forceMoveMarkers: true
    }]);

    // 如果是插入新模板（未选文字），自动高亮占位符
    if (!selectedText && placeholder) {
      const position = editor.getPosition();
      if (position) {
        const lines = textToInsert.split('\n');
        
        if (lines.length === 1) {
          // 单行处理
          const lastLineContent = lines[0];
          const placeholderIdx = lastLineContent.indexOf(placeholder);
          const startCol = position.column - (lastLineContent.length - placeholderIdx);
          editor.setSelection(new Selection(position.lineNumber, startCol, position.lineNumber, startCol + placeholder.length));
        } else {
          // 多行（块级公式）处理
          const pIdx = textToInsert.indexOf(placeholder);
          const beforePlaceholder = textToInsert.substring(0, pIdx);
          const linesBefore = beforePlaceholder.split('\n');
          const targetLineNumber = (position.lineNumber - lines.length + 1) + linesBefore.length - 1;
          const targetColumn = linesBefore[linesBefore.length - 1].length + 1;
          
          editor.setSelection(new Selection(
            targetLineNumber, 
            targetColumn, 
            targetLineNumber, 
            targetColumn + placeholder.length
          ));
        }
      }
    }
    editor.focus();
  };

  // --- UI 组件：公式下拉按钮 ---
  function MathFormulaButton() {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
      <div className="relative" ref={menuRef}>
        <button 
          onClick={() => setIsOpen(!isOpen)} 
          className={`p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white flex items-center gap-1 ${isOpen ? 'bg-gray-200 dark:bg-zinc-700' : ''}`}
          title="插入数学公式"
        >
          <i className="ri-functions" />
          <i className="ri-arrow-down-s-line text-[10px]" />
        </button>

        {isOpen && (
          <div className="absolute left-0 top-full mt-1 z-50 w-48 bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-lg shadow-xl py-1">
            {mathSymbols.map((sym) => (
              <button
                key={sym.label}
                className="w-full px-3 py-2 text-left text-xs hover:bg-theme hover:text-white dark:text-gray-300 transition-colors flex justify-between items-center"
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

  // --- 基础功能：图片、表格、样式 ---
  const uploadImage = (file: File, onSuccess: (url: string) => void) => {
    client.storage.index.post({ key: file.name, file: file }, { headers: headersWithAuth() })
      .then(({ data, error }) => {
        if (error) console.error(t("upload.failed"));
        if (data) onSuccess(data);
      }).catch(() => console.error(t("upload.failed")));
  };

  const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
    const clipboardData = event.clipboardData;
    if (clipboardData.files.length === 1) {
      const editor = editorRef.current;
      if (!editor) return;
      setUploading(true);
      const file = clipboardData.files[0] as File;
      uploadImage(file, (url) => {
        const selection = editor.getSelection();
        if (selection) editor.executeEdits("paste-img", [{ range: selection, text: `![${file.name}](${url})\n` }]);
        setUploading(false);
      });
    }
  };

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
    if (!style) return;
    const newText = style.reg.test(selectedText) ? selectedText.replace(style.reg, '$1') : `${style.before}${selectedText}${style.after}`;
    editor.executeEdits("style", [{ range: selection, text: newText, forceMoveMarkers: true }]);
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
    for (let i = 0; i < rows; i++) tableMd += "| " + Array(cols).fill("Content").join(" | ") + " |\n";
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
    editor.executeEdits("span", [{ range: selection, text: `<span style="${styleStr}">${model.getValueInRange(selection)}</span>`, forceMoveMarkers: true }]);
    editor.focus();
  };

  const removeFormatting = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;
    const cleanText = model.getValueInRange(selection).replace(/<[^>]*>/g, '').replace(/(\*\*|\*|~~)/g, '');
    editor.executeEdits("clean", [{ range: selection, text: cleanText, forceMoveMarkers: true }]);
    editor.focus();
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
    editor.onDidChangeModelContent(() => {
      if (!isComposingRef.current) setContent(editor.getValue());
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
            <label className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme cursor-pointer" title="上传图片">
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setUploading(true);
                  uploadImage(file, (url) => {
                    const sel = editorRef.current?.getSelection() || new Selection(1,1,1,1);
                    editorRef.current?.executeEdits("img", [{ range: sel, text: `![${file.name}](${url})\n` }]);
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
            <button onClick={() => applySpanStyle('background-color: #ffff00; color: #000')} className="p-1.5 bg-yellow-200 hover:bg-yellow-300 rounded text-black"><i className="ri-mark-pen-line" /></button>
            <button onClick={removeFormatting} className="p-1.5 hover:bg-red-100 text-red-500 rounded"><i className="ri-format-clear" /></button>
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
