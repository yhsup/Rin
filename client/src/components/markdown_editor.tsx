import Editor from '@monaco-editor/react';
import { editor, Selection } from 'monaco-editor'; // 引入 Selection 类
import React, { useRef, useState } from "react"; // 删除了未使用的 useEffect
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
  fontFamily = "Sarasa Mono SC, JetBrains Mono, monospace"
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const colorMode = useColorMode();
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const isComposingRef = useRef(false);
  const [preview, setPreview] = useState<'edit' | 'preview' | 'comparison'>('edit');
  const [uploading, setUploading] = useState(false);

  // --- 图片上传逻辑 ---
  function uploadImage(file: File, onSuccess: (url: string) => void, showAlert: (msg: string) => void) {
    client.storage.index
      .post(
        { key: file.name, file: file },
        { headers: headersWithAuth() }
      )
      .then(({ data, error }) => {
        if (error) showAlert(t("upload.failed"));
        if (data) onSuccess(data);
      })
      .catch((e: any) => {
        console.error(e);
        showAlert(t("upload.failed"));
      });
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
        if (!selection) return;
        editor.executeEdits(undefined, [{
          range: selection,
          text: `![${myfile.name}](${url})\n`,
        }]);
        setUploading(false);
      }, (msg) => {
        console.error(msg);
        setUploading(false);
      });
    }
  };

  // --- 样式处理逻辑 ---
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

  // --- 上传按钮组件 ---
  function UploadImageButton() {
    const uploadRef = useRef<HTMLInputElement>(null);
    const upChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.currentTarget.files;
      if (!files) return;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > 5 * 1024000) {
          alert("File too large (max 5MB)");
        } else {
          const editor = editorRef.current;
          if (!editor) return;
          const selection = editor.getSelection() || new Selection(1, 1, 1, 1);
          setUploading(true);
          uploadImage(file, (url) => {
            setUploading(false);
            editor.executeEdits(undefined, [{
              range: selection,
              text: `![${file.name}](${url})\n`,
            }]);
          }, (msg) => {
            console.error(msg);
            setUploading(false);
          });
        }
      }
    };
    return (
      <button onClick={() => uploadRef.current?.click()} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme" title="上传图片">
        <input ref={uploadRef} onChange={upChange} className="hidden" type="file" accept="image/*" />
        <i className="ri-image-add-line" />
      </button>
    );
  }

  const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    editor.onDidChangeModelContent(() => {
      if (!isComposingRef.current) setContent(editor.getValue());
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-row items-center space-x-2 border-b pb-2 dark:border-zinc-800">
        {['edit', 'preview', 'comparison'].map((m) => (
          <button 
            key={m} 
            className={`px-3 py-1 text-xs rounded-md transition-all ${preview === m ? "bg-theme text-white shadow-md" : "hover:bg-gray-100 dark:hover:bg-zinc-800"}`} 
            onClick={() => setPreview(m as any)}
          >
            {t(m) || m}
          </button>
        ))}
        <div className="flex-grow" />
        {uploading && (
          <div className="flex flex-row space-x-2 items-center">
            <Loading type="spin" color="#FC466B" height={16} width={16} />
            <span className="text-sm text-neutral-500">{t('uploading')}</span>
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 ${preview === 'comparison' ? "lg:grid-cols-2" : ""} gap-4`}>
        <div className={preview === 'preview' ? "hidden" : "flex flex-col"}>
          <div className="flex flex-wrap items-center gap-y-2 gap-x-1 mb-2 p-2 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border dark:border-zinc-800">
            <UploadImageButton />
            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            <button onClick={() => applyStyle('bold')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded" title="加粗"><i className="ri-bold" /></button>
            <button onClick={() => applyStyle('italic')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded" title="斜体"><i className="ri-italic" /></button>
            <button onClick={() => applyStyle('underline')} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded" title="下划线"><i className="ri-underline" /></button>
            <button onClick={insertTable} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded" title="插入表格"><i className="ri-table-line" /></button>
            <div className="flex items-center px-1">
              <input type="color" className="w-5 h-5 p-0 border-none cursor-pointer bg-transparent" onChange={(e) => applySpanStyle(`color: ${e.target.value}`)} title="颜色" />
            </div>
          </div>

          <div 
            className="border rounded-xl overflow-hidden dark:border-zinc-800 shadow-sm bg-white dark:bg-[#1e1e1e]"
            onPaste={handlePaste}
            onDrop={(e) => {
              e.preventDefault();
              const editor = editorRef.current;
              if (!editor) return;
              const files = e.dataTransfer.files;
              for (let i = 0; i < files.length; i++) {
                setUploading(true);
                uploadImage(files[i], (url) => {
                  setUploading(false);
                  const selection = editor.getSelection() || new Selection(1, 1, 1, 1);
                  editor.executeEdits(undefined, [{
                    range: selection,
                    text: `![${files[i].name}](${url})\n`,
                  }]);
                }, () => setUploading(false));
              }
            }}
          >
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
                dropIntoEditor: { enabled: true }
              }} 
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
