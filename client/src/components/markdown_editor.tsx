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
  const isComposingRef = useRef(false);
  const [preview, setPreview] = useState<'edit' | 'preview' | 'comparison'>('edit');
  const [uploading, setUploading] = useState(false);

  /* ---------------- 样式应用逻辑 ---------------- */
  const applyStyle = (type: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'sup' | 'sub') => {
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

    // 执行编辑：包裹选中文本
    editor.executeEdits("style-applier", [{
      range: selection,
      text: `${before}${selectedText}${after}`,
      forceMoveMarkers: true
    }]);

    // 如果之前没有选中文字，将光标移回标签中间
    if (selectedText === "") {
      const position = editor.getPosition();
      if (position) {
        editor.setPosition({
          lineNumber: position.lineNumber,
          column: position.column - after.length
        });
      }
    }
    editor.focus();
  };

  /* ---------------- 图片上传逻辑 ---------------- */
  function uploadImage(file: File, onSuccess: (url: string) => void, showAlert: (msg: string) => void) {
    client.storage.index
      .post({ key: file.name, file: file }, { headers: headersWithAuth() })
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
      editor.trigger(undefined, "undo", undefined);
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
      }, (msg) => console.error(msg));
    }
  };

  function UploadImageButton() {
    const uploadRef = useRef<HTMLInputElement>(null);
    const upChange = (event: any) => {
      for (let i = 0; i < event.currentTarget.files.length; i++) {
        const file = event.currentTarget.files[i];
        if (file.size > 5 * 1024000) {
          alert("File too large (max 5MB)");
          uploadRef.current!.value = "";
        } else {
          const editor = editorRef.current;
          if (!editor) return;
          const selection = editor.getSelection();
          if (!selection) return;
          setUploading(true);
          uploadImage(file, (url) => {
            setUploading(false);
            editor.executeEdits(undefined, [{
              range: selection,
              text: `![${file.name}](${url})\n`,
            }]);
          }, (msg) => console.error(msg));
        }
      }
    };
    return (
      <button onClick={() => uploadRef.current?.click()} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded transition-colors" title={t("upload_image")}>
        <input ref={uploadRef} onChange={upChange} className="hidden" type="file" accept="image/gif,image/jpeg,image/jpg,image/png" />
        <i className="ri-image-add-line text-lg" />
      </button>
    );
  }

  /* ---------------- 编辑器生命周期 ---------------- */
  const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // 快捷键支持
    editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyB, () => applyStyle('bold'));
    editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyI, () => applyStyle('italic'));
    editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.KeyU, () => applyStyle('underline'));

    editor.onDidCompositionStart(() => { isComposingRef.current = true; });
    editor.onDidCompositionEnd(() => {
      isComposingRef.current = false;
      setContent(editor.getValue());
    });
    editor.onDidChangeModelContent(() => {
      if (!isComposingRef.current) setContent(editor.getValue());
    });
    editor.onDidBlurEditorText(() => { setContent(editor.getValue()); });
  };

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    if (model.getValue() !== content) editor.setValue(content);
  }, [content]);

  return (
    <div className="flex flex-col mx-4 my-2 md:mx-0 md:my-0 gap-2">
      {/* 顶部预览模式切换 */}
      <div className="flex flex-row space-x-2 border-b pb-2 dark:border-zinc-800">
        <button className={`px-2 py-1 rounded ${preview === 'edit' ? "bg-theme text-white" : "hover:bg-gray-100 dark:hover:bg-zinc-800"}`} onClick={() => setPreview('edit')}> {t("edit")} </button>
        <button className={`px-2 py-1 rounded ${preview === 'preview' ? "bg-theme text-white" : "hover:bg-gray-100 dark:hover:bg-zinc-800"}`} onClick={() => setPreview('preview')}> {t("preview")} </button>
        <button className={`px-2 py-1 rounded ${preview === 'comparison' ? "bg-theme text-white" : "hover:bg-gray-100 dark:hover:bg-zinc-800"}`} onClick={() => setPreview('comparison')}> {t("comparison")} </button>
        <div className="flex-grow" />
        {uploading &&
          <div className="flex flex-row space-x-2 items-center">
            <Loading type="spin" color="#FC466B" height={16} width={16} />
            <span className="text-sm text-neutral-500">{t('uploading')}</span>
          </div>
        }
      </div>

      <div className={`grid grid-cols-1 ${preview === 'comparison' ? "sm:grid-cols-2" : ""}`}>
        <div className={"flex flex-col " + (preview === 'preview' ? "hidden" : "")}>
          
          {/* 样式工具栏 */}
          <div className="flex flex-row items-center gap-2 mb-2 px-1 py-1 bg-gray-50 dark:bg-zinc-900/50 rounded-md shadow-sm border dark:border-zinc-800">
            <UploadImageButton />
            <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
            
            <button onClick={() => applyStyle('bold')} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded transition-colors" title="加粗 (Ctrl+B)"><i className="ri-bold text-lg" /></button>
            <button onClick={() => applyStyle('italic')} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded transition-colors" title="斜体 (Ctrl+I)"><i className="ri-italic text-lg" /></button>
            <button onClick={() => applyStyle('underline')} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded transition-colors" title="下划线 (Ctrl+U)"><i className="ri-underline text-lg" /></button>
            <button onClick={() => applyStyle('strikethrough')} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded transition-colors" title="中划线"><i className="ri-strikethrough text-lg" /></button>
            <button onClick={() => applyStyle('sup')} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded transition-colors" title="上标"><i className="ri-superscript text-lg" /></button>
            <button onClick={() => applyStyle('sub')} className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded transition-colors" title="下标"><i className="ri-subscript text-lg" /></button>
          </div>

          <div
            className={"relative border rounded-lg overflow-hidden dark:border-zinc-800"}
            onDrop={(e) => {
              e.preventDefault();
              const editor = editorRef.current;
              if (!editor) return;
              for (let i = 0; i < e.dataTransfer.files.length; i++) {
                const selection = editor.getSelection();
                if (!selection) return;
                const file = e.dataTransfer.files[i];
                setUploading(true);
                uploadImage(file, (url) => {
                  setUploading(false);
                  editor.executeEdits(undefined, [{ range: selection, text: `![${file.name}](${url})\n` }]);
                }, (msg) => console.error(msg));
              }
            }}
            onPaste={handlePaste}
          >
            <Editor
              onMount={handleEditorMount}
              height={height}
              defaultLanguage="markdown"
              defaultValue={content}
              theme={colorMode === "dark" ? "vs-dark" : "light"}
              options={{
                wordWrap: "on",
                fontFamily: fontFamily,
                fontSize: fontSize,
                lineHeight: lineHeight,
                fontLigatures: false,
                letterSpacing: 0,
                lineNumbers: "off",
                accessibilitySupport: "off",
                unicodeHighlight: { ambiguousCharacters: false },
                renderWhitespace: "none",
                renderControlCharacters: false,
                smoothScrolling: true,
                dragAndDrop: true,
                pasteAs: { enabled: false },
                automaticLayout: true,
                minimap: { enabled: false },
                scrollbar: {
                    vertical: 'auto',
                    horizontal: 'auto'
                }
              }}
            />
          </div>
        </div>
        
        {/* 预览区 */}
        <div className={"px-4 overflow-y-scroll border-l dark:border-zinc-800 " + (preview !== 'edit' ? "" : "hidden")} style={{ height: height }}>
          <Markdown content={content ? content : placeholder} />
        </div>
      </div>
    </div>
  );
}
