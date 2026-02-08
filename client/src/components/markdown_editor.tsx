import Editor, { loader } from '@monaco-editor/react';
import { editor, Selection, KeyMod, KeyCode } from 'monaco-editor';
import { useRef, useState, useCallback } from "react";
import Loading from 'react-loading';
import { useTranslation } from "react-i18next";
import { useColorMode } from "../utils/darkModeUtils";
import { Markdown } from "./markdown";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";

loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs' } });

interface MarkdownEditorProps {
  content: string;
  setContent: (content: string) => void;
  placeholder?: string;
  height?: string;
}

export function MarkdownEditor({
  content,
  setContent,
  placeholder = "> Write your content here...",
  height = "500px"
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const colorMode = useColorMode();
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const isComposingRef = useRef(false);
  const [uploading, setUploading] = useState(false);
  
  // 找回丢失的预览状态
  const [preview, setPreview] = useState<'edit' | 'preview' | 'comparison'>('edit');
  
  const [bubblePos, setBubblePos] = useState<{ x: number, y: number } | null>(null);
  const [activeStyles, setActiveStyles] = useState<Record<string, boolean>>({});

  const mathSymbols = [
    { label: "行内公式容器", value: "$公式$", placeholder: "公式" },
    { label: "块级公式容器", value: "\n$$\n公式内容\n$$\n", placeholder: "公式内容" },
    { label: "分式 (frac)", value: "$\\frac{分子}{分母}$", placeholder: "分子" },
    { label: "定积分 (int)", value: "$\\int_{下限}^{上限} f(x) dx$", placeholder: "下限" },
    { label: "根号 (sqrt)", value: "$\\sqrt{内容}$", placeholder: "内容" },
  ];

  /* ---------------- 样式检测与应用 ---------------- */

  const checkStyleStatus = useCallback((editor: editor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection) return;
    const line = model.getLineContent(selection.startLineNumber);
    const startCol = selection.startColumn;

    const isWrapped = (tag: string) => {
      const leftPart = line.substring(Math.max(0, startCol - 1 - tag.length), startCol - 1);
      const selectedText = model.getValueInRange(selection);
      return leftPart === tag || selectedText.includes(tag);
    };

    const getStarCount = () => {
      for (let i = 3; i >= 1; i--) if (isWrapped("*".repeat(i))) return i;
      return 0;
    };

    const sLevel = getStarCount();
    setActiveStyles({
      bold: sLevel >= 2,
      italic: sLevel === 1 || sLevel === 3,
      underline: isWrapped('<u>'),
      strikethrough: isWrapped('~~'),
      sup: isWrapped('<sup>'),
      sub: isWrapped('<sub>'),
    });
  }, []);

  const applyStyle = useCallback((type: string) => {
    const editor = editorRef.current;
    if (!editor || !editor.getModel()) return;
    const selection = editor.getSelection();
    const model = editor.getModel()!;
    const selectedText = model.getValueInRange(selection!);

    const styleMap: any = {
      bold: { tag: '**', reg: /\*\*/g },
      italic: { tag: '*', reg: /\*/g },
      underline: { tag: '<u>', end: '</u>', reg: /<\/?u>/g },
      strikethrough: { tag: '~~', reg: /~~/g },
      sup: { tag: '<sup>', end: '</sup>', reg: /<\/?sup>/g },
      sub: { tag: '<sub>', end: '</sub>', reg: /<\/?sub>/g },
    };

    const s = styleMap[type];
    const endTag = s.end || s.tag;
    const isRemoving = selectedText.includes(s.tag);
    const newText = isRemoving ? selectedText.replace(s.reg, '') : `${s.tag}${selectedText}${endTag}`;
    
    editor.executeEdits("style", [{ range: selection!, text: newText, forceMoveMarkers: true }]);
    
    const delta = newText.length - selectedText.length;
    editor.setSelection(new Selection(
      selection!.startLineNumber, selection!.startColumn,
      selection!.endLineNumber, selection!.endColumn + delta
    ));

    setTimeout(() => checkStyleStatus(editor), 50);
    editor.focus();
  }, [checkStyleStatus]);

  /* ---------------- 公式与文件处理 ---------------- */

  const insertMathTemplate = useCallback((template: string, placeholder?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection()!;
    const model = editor.getModel()!;
    const selectedText = model.getValueInRange(selection);
    let textToInsert = template;
    if (selectedText === "公式" || selectedText === "公式内容") {
      textToInsert = template.replace(/^\$?\$?/, '').replace(/\$?\$?$/, '');
    } else if (selectedText && placeholder) {
      textToInsert = template.replace(placeholder, selectedText);
    }
    editor.executeEdits("insert", [{ range: selection, text: textToInsert, forceMoveMarkers: true }]);
    if (placeholder && (!selectedText || selectedText === "公式")) {
      setTimeout(() => {
        const matches = model.findMatches(placeholder, true, false, false, null, false);
        const currentPos = editor.getPosition();
        const nearest = matches.find(m => m.range.startLineNumber === currentPos?.lineNumber);
        if (nearest) editor.setSelection(nearest.range);
      }, 50);
    }
    editor.focus();
  }, []);

  const handleFileUpload = (file: File) => {
    const editor = editorRef.current;
    if (!editor) return;
    setUploading(true);
    const id = Math.random().toString(36).substring(7);
    const placeholderText = `\n![⌛ 正在上传... {${id}}]()\n`;
    editor.executeEdits("upload", [{ range: editor.getSelection()!, text: placeholderText, forceMoveMarkers: true }]);
    
    client.storage.index.post({ key: file.name, file: file }, { headers: headersWithAuth() })
      .then(({ data }) => {
        if (data) {
          const find = editor.getModel()?.findMatches(`{${id}}`, false, false, false, null, false);
          if (find?.[0]) editor.executeEdits("complete", [{ range: find[0].range.setStartPosition(find[0].range.startLineNumber, 1).setEndPosition(find[0].range.startLineNumber, 1000), text: `![${file.name}](${data})` }]);
        }
        setUploading(false);
      });
  };

  const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    // 快捷键
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyB, () => applyStyle('bold'));
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyI, () => applyStyle('italic'));
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyU, () => applyStyle('underline'));
    editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE, () => insertMathTemplate("$公式$", "公式"));

    // 智能包裹 $ 和 <
    editor.onKeyDown((e) => {
      const sel = editor.getSelection();
      if (sel && !sel.isEmpty() && (e.browserEvent.key === '$' || e.browserEvent.key === '<')) {
        e.preventDefault();
        const end = e.browserEvent.key === '<' ? '>' : '$';
        const text = editor.getModel()?.getValueInRange(sel);
        editor.executeEdits("wrap", [{ range: sel, text: `${e.browserEvent.key}${text}${end}` }]);
      }
    });

    editor.onDidChangeCursorSelection((e) => {
      checkStyleStatus(editor);
      if (!e.selection.isEmpty() && preview !== 'preview') {
        const coords = editor.getScrolledVisiblePosition(e.selection.getStartPosition());
        const rect = editor.getDomNode()?.getBoundingClientRect();
        if (coords && rect) setBubblePos({ x: coords.left + rect.left, y: coords.top + rect.top - 65 });
      } else { setBubblePos(null); }
    });

    editor.onDidChangeModelContent(() => { if (!isComposingRef.current) setContent(editor.getValue()); });
  };

  return (
    <div className="flex flex-col mx-4 my-2 md:mx-0 md:my-0 gap-2 relative">
      {/* 预览切换栏 (找回的功能) */}
      <div className="flex flex-row space-x-4 mb-1 px-1">
        <button className={`text-sm font-medium transition-colors ${preview === 'edit' ? "text-theme underline underline-offset-4" : "text-neutral-500"}`} onClick={() => setPreview('edit')}> {t("edit")} </button>
        <button className={`text-sm font-medium transition-colors ${preview === 'preview' ? "text-theme underline underline-offset-4" : "text-neutral-500"}`} onClick={() => setPreview('preview')}> {t("preview")} </button>
        <button className={`text-sm font-medium transition-colors ${preview === 'comparison' ? "text-theme underline underline-offset-4" : "text-neutral-500"}`} onClick={() => setPreview('comparison')}> {t("comparison")} </button>
        <div className="flex-grow" />
        {uploading && (
          <div className="flex items-center gap-2">
            <Loading type="spin" color="#FC466B" height={14} width={14} />
            <span className="text-xs text-neutral-400">{t('uploading')}</span>
          </div>
        )}
      </div>

      {/* 悬浮工具栏 */}
      {bubblePos && preview !== 'preview' && (
        <div className="fixed z-[100] flex items-center gap-0.5 bg-white dark:bg-zinc-800 shadow-2xl border dark:border-zinc-700 p-1.5 rounded-xl animate-in fade-in zoom-in-95" style={{ left: bubblePos.x, top: bubblePos.y }}>
          <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" sm />
          <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" sm />
          <ToolbarButton active={activeStyles.underline} onClick={() => applyStyle('underline')} icon="ri-underline" sm />
          <ToolbarButton active={activeStyles.strikethrough} onClick={() => applyStyle('strikethrough')} icon="ri-strikethrough" sm />
          <div className="w-[1px] h-3 bg-gray-200 dark:bg-zinc-700 mx-1" />
          <ToolbarButton active={activeStyles.sup} onClick={() => applyStyle('sup')} icon="ri-superscript" sm />
          <ToolbarButton active={activeStyles.sub} onClick={() => applyStyle('sub')} icon="ri-subscript" sm />
          <div className="w-[1px] h-3 bg-gray-200 dark:bg-zinc-700 mx-1" />
          <button onClick={() => insertMathTemplate("$公式$", "公式")} className="p-1 text-theme hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"><i className="ri-functions text-sm" /></button>
        </div>
      )}

      {/* 样式工具栏 */}
      <div className={`flex flex-wrap items-center gap-1 p-2 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border dark:border-zinc-800 ${preview === 'preview' ? "hidden" : ""}`}>
        <label className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme cursor-pointer"><input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files?.[0])} /><i className="ri-image-add-line" /></label>
        <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
        <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" />
        <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" />
        <ToolbarButton active={activeStyles.underline} onClick={() => applyStyle('underline')} icon="ri-underline" />
        <ToolbarButton active={activeStyles.strikethrough} onClick={() => applyStyle('strikethrough')} icon="ri-strikethrough" />
        <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
        <ToolbarButton active={activeStyles.sup} onClick={() => applyStyle('sup')} icon="ri-superscript" />
        <ToolbarButton active={activeStyles.sub} onClick={() => applyStyle('sub')} icon="ri-subscript" />
        <div className="flex-grow" />
        <div className="relative group">
          <button className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded flex items-center gap-1"><i className="ri-functions" /><i className="ri-arrow-down-s-line text-[10px]" /></button>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 w-40 bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-lg shadow-xl py-1">
            {mathSymbols.map(s => (
              <button key={s.label} className="w-full px-3 py-2 text-left text-xs hover:bg-theme hover:text-white transition-colors" onClick={() => insertMathTemplate(s.value, s.placeholder)}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* 编辑器与预览区域 */}
      <div className={`grid grid-cols-1 gap-4 ${preview === 'comparison' ? "lg:grid-cols-2" : ""}`}>
        <div className={`border rounded-xl overflow-hidden shadow-inner bg-white dark:bg-[#1e1e1e] ${preview === 'preview' ? "hidden" : ""}`} onPaste={(e) => e.clipboardData.files[0] && handleFileUpload(e.clipboardData.files[0])}>
          <Editor onMount={handleEditorMount} height={height} defaultLanguage="markdown" value={content} theme={colorMode === "dark" ? "vs-dark" : "light"}
            options={{ wordWrap: "on", fontSize: 15, minimap: { enabled: false }, smoothScrolling: true, cursorSmoothCaretAnimation: "on", autoClosingBrackets: 'always' }} 
          />
        </div>
        <div className={`px-4 py-2 border rounded-xl overflow-y-auto bg-white dark:bg-zinc-900 ${preview === 'edit' ? "hidden" : ""}`} style={{ height: height }}>
          <Markdown content={content ? content : placeholder} />
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ active, onClick, icon, sm }: { active?: boolean, onClick: () => void, icon: string, sm?: boolean }) {
  return (
    <button onClick={onClick} className={`rounded transition-all ${sm ? 'p-1' : 'p-1.5'} ${active ? 'bg-theme text-white shadow-md' : 'hover:bg-gray-200 dark:hover:bg-zinc-700 dark:text-gray-300'}`}>
      <i className={`${icon} ${sm ? 'text-xs' : 'text-base'}`} />
    </button>
  );
}
