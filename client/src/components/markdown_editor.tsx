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

  // --- 数学符号定义 ---
  const mathSymbols = [
    { label: "行内公式", value: "$ $", offset: 2 },
    { label: "块级公式", value: "\n$$\n\n$$\n", offset: 4 },
    { label: "分式 (frac)", value: "\\frac{num}{den}", offset: 10 },
    { label: "根号 (sqrt)", value: "\\sqrt{x}", offset: 7 },
    { label: "求和 (sum)", value: "\\sum_{i=1}^{n}", offset: 13 },
    { label: "积分 (int)", value: "\\int_{a}^{b}", offset: 11 },
    { label: "乘法 (times)", value: "\\times", offset: 7 },
    { label: "希腊字母 (π)", value: "\\pi", offset: 3 },
  ];

  const insertText = (text: string, selectionOffset?: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    if (!selection) return;

    editor.executeEdits("insert-text", [{
      range: selection,
      text: text,
      forceMoveMarkers: true
    }]);

    if (selectionOffset) {
      const position = editor.getPosition();
      if (position) {
        editor.setPosition({
          lineNumber: position.lineNumber,
          column: position.column - (text.length - selectionOffset)
        });
      }
    }
    editor.focus();
  };

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
        <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded">
          <button 
            onClick={() => insertText("\n$$\n\n$$\n", 4)} 
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-l dark:text-white border-r dark:border-zinc-700" 
            title="插入公式块"
          >
            <i className="ri-functions" />
          </button>
          <button 
            onClick={() => setIsOpen(!isOpen)} 
            className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded-r dark:text-white"
          >
            <i className="ri-arrow-down-s-line text-[10px]" />
          </button>
        </div>

        {isOpen && (
          <div className="absolute left-0 top-full mt-1 z-50 w-40 bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-lg shadow-xl py-1 grid grid-cols-1">
            {mathSymbols.map((sym) => (
              <button
                key={sym.label}
                className="px-3 py-1.5 text-left text-xs hover:bg-theme hover:text-white dark:text-gray-300 transition-colors"
                onClick={() => {
                  insertText(sym.value, sym.offset);
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
    let newText = style.reg.test(selectedText) ? selectedText.replace(style.reg, '$1') : `${style.before}${selectedText}${style.after}`;
    editor.executeEdits("style", [{ range: selection, text: newText, forceMoveMarkers: true }]);
    if (!selection.isEmpty()) {
        const lines = newText.split('\n');
        const endLineNumber = selection.startLineNumber + lines.length - 1;
        const endColumn = lines.length === 1 ? selection.startColumn + newText.length : lines[lines.length-1].length + 1;
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
    for (let i = 0; i < rows; i++) { tableMd += "| " + Array(cols).fill("Content").join(" | ") + " |\n"; }
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
    editor.onMouseDown((e) => {
      if (e.event.detail === 2) {
        const position = e.target.position;
        if (!position) return;
        const model = editor.getModel();
        if (!model) return;
        if (position.column === 1) {
          const lineContent = model.getLineContent(position.lineNumber);
          editor.setSelection(new Selection(position.lineNumber, 1, position.lineNumber, lineContent.length + 1));
          e.event.preventDefault();
          return;
        }
        const lineContent = model.getLineContent(position.lineNumber);
        const offset = position.column - 1;
        const boundaryRegex = /[\s，。！？、；：""''（）【】《》\[\](){}<>|*`~_-]/;
        let start = offset;
        let end = offset;
        while (start > 0 && !boundaryRegex.test(lineContent[start - 1])) { start--; }
        while (end < lineContent.length && !boundaryRegex.test(lineContent[end])) { end++; }
        if (start < end) {
          editor.setSelection(new Selection(position.lineNumber, start + 1, position.lineNumber, end + 1));
          e.event.preventDefault();
          e.event.stopPropagation();
        }
      }
    });
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
            
            <button onClick={() => applyStyle('bold')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="加粗"><i className="ri-bold" /></button>
            <button onClick={() => applyStyle('italic')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="斜体"><i className="ri-italic" /></button>
            <button onClick={() => applyStyle('underline')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="下划线"><i className="ri-underline" /></button>
            <button onClick={() => applyStyle('strikethrough')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="中划线"><i className="ri-strikethrough" /></button>
            
            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            <button onClick={insertTable} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="插入表格"><i className="ri-table-line" /></button>
            
            {/* 保留：数学公式按钮及下拉符号 */}
            <MathFormulaButton />

            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            <button onClick={() => applyStyle('sup')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="上标"><i className="ri-superscript" /></button>
            <button onClick={() => applyStyle('sub')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded dark:text-white" title="下标"><i className="ri-subscript" /></button>
            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            <button onClick={() => applySpanStyle('background-color: #ffff00; color: #000')} className="p-1.5 bg-yellow-200 hover:bg-yellow-300 rounded text-black" title="黄色高亮"><i className="ri-mark-pen-line" /></button>
            <button onClick={removeFormatting} className="p-1.5 hover:bg-red-100 text-red-500 rounded" title="清除格式"><i className="ri-format-clear" /></button>
          </div>

          <div className="border rounded-xl overflow-hidden dark:border-zinc-800 bg-white dark:bg-[#1e1e1e]" onPaste={handlePaste}>
            <Editor onMount={handleEditorMount} height={height} defaultLanguage="markdown" value={content} theme={colorMode === "dark" ? "vs-dark" : "light"}
              options={{ wordWrap: "on", fontFamily: fontFamily, fontLigatures: true, fontSize: 14, minimap: { enabled: false }, automaticLayout: true, lineNumbers: "on", padding: { top: 10 }, selectOnLineNumbers: true }} 
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
