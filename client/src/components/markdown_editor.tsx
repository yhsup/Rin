import Editor, { loader } from '@monaco-editor/react';
import { editor, Selection, KeyMod, KeyCode } from 'monaco-editor';
import { useRef, useState, useCallback } from "react";
import Loading from 'react-loading';
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
  placeholder = "",
  height = "500px"
}: MarkdownEditorProps) {
  const colorMode = useColorMode();
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const isComposingRef = useRef(false);
  const [preview] = useState<'edit' | 'preview' | 'comparison'>('edit');
  const [uploading, setUploading] = useState(false);
  
  const [bubblePos, setBubblePos] = useState<{ x: number, y: number } | null>(null);
  const [activeStyles, setActiveStyles] = useState<Record<string, boolean>>({});

  const mathSymbols = [
    { label: "行内公式容器", value: "$公式$", placeholder: "公式" },
    { label: "块级公式容器", value: "\n$$\n公式内容\n$$\n", placeholder: "公式内容" },
    { label: "分式 (frac)", value: "$\\frac{分子}{分母}$", placeholder: "分子" },
    { label: "定积分 (int)", value: "$\\int_{下限}^{上限} f(x) dx$", placeholder: "下限" },
    { label: "根号 (sqrt)", value: "$\\sqrt{内容}$", placeholder: "内容" },
  ];

  // --- 终极状态感应逻辑：分层探测 & 独立标签识别 ---
  const checkStyleStatus = useCallback((editor: editor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection) return;
    const line = model.getLineContent(selection.startLineNumber);
    const col = selection.startColumn;

    // 1. 探测星号层级 (Markdown 核心)
    const getStarLevel = () => {
      for (let i = 3; i >= 1; i--) {
        const s = "*".repeat(i);
        const idxOpen = line.lastIndexOf(s, col - 1);
        const idxClose = line.indexOf(s, col - 1);
        if (idxOpen !== -1 && idxClose !== -1 && idxOpen < idxClose) return i;
      }
      return 0;
    };

    // 2. 探测独立标签 (HTML 风格)
    const hasTag = (open: string, close: string) => {
      const idxOpen = line.lastIndexOf(open, col - 1);
      const idxClose = line.indexOf(close, col - 1);
      return idxOpen !== -1 && idxClose !== -1 && idxOpen < idxClose;
    };

    const sLevel = getStarLevel();

    setActiveStyles({
      bold: sLevel >= 2,                         // ** 或 *** 触发加粗
      italic: sLevel === 1 || sLevel === 3,      // * 或 *** 触发斜体
      underline: hasTag('<u>', '</u>'),
      strikethrough: hasTag('~~', '~~'),
      sup: hasTag('<sup>', '</sup>'),
      sub: hasTag('<sub>', '</sub>'),
    });
  }, []);

  const applyStyle = useCallback((type: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;
    const selectedText = model.getValueInRange(selection);

    const styleMap: any = {
      bold: { b: '**', a: '**', reg: /^\*\*([\s\S]*)\*\*$/ },
      italic: { b: '*', a: '*', reg: /^\*([\s\S]*)\*$/ },
      underline: { b: '<u>', a: '</u>', reg: /^<u>([\s\S]*)<\/u>$/ },
      strikethrough: { b: '~~', a: '~~', reg: /^~~([\s\S]*)~~$/ },
      sup: { b: '<sup>', a: '</sup>', reg: /^<sup>([\s\S]*)<\/sup>$/ },
      sub: { b: '<sub>', a: '</sub>', reg: /^<sub>([\s\S]*)<\/sub>$/ },
    };

    const s = styleMap[type];
    const isRemoving = s.reg.test(selectedText);
    const newText = isRemoving ? selectedText.replace(s.reg, '$1') : `${s.b}${selectedText}${s.a}`;
    
    editor.executeEdits("style", [{ range: selection, text: newText, forceMoveMarkers: true }]);
    
    // 延迟执行状态同步，确保 UI 刷新
    setTimeout(() => {
        checkStyleStatus(editor);
    }, 25);
    editor.focus();
  }, [checkStyleStatus]);

  const insertMathTemplate = useCallback((template: string, placeholder?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;

    const selectedText = model.getValueInRange(selection);
    let textToInsert = template;
    const isReplacingPlaceholder = selectedText === "公式" || selectedText === "公式内容";
    
    if (isReplacingPlaceholder) {
      textToInsert = template.replace(/^\$/, '').replace(/\$$/, '');
    } else if (selectedText && placeholder && !isReplacingPlaceholder) {
      textToInsert = template.replace(placeholder, selectedText);
    }

    editor.executeEdits("insert", [{ range: selection, text: textToInsert, forceMoveMarkers: true }]);
    
    if ((!selectedText || isReplacingPlaceholder) && placeholder) {
      setTimeout(() => {
        const currentPos = editor.getPosition();
        if (!currentPos) return;
        const matches = model.findMatches(placeholder, true, false, false, null, false);
        const nearestMatch = matches.find(m => m.range.startLineNumber === currentPos.lineNumber || m.range.startLineNumber === currentPos.lineNumber - 1);
        if (nearestMatch) editor.setSelection(nearestMatch.range);
      }, 10);
    }
    editor.focus();
  }, []);

  const handleFileUpload = (file: File) => {
    const editor = editorRef.current;
    if (!editor) return;
    setUploading(true);
    const id = Math.random().toString(36).substring(7);
    const placeholderText = `\n![⌛ 正在上传 ${file.name}... {${id}}]()\n`;
    const selection = editor.getSelection() || new Selection(1,1,1,1);
    editor.executeEdits("upload", [{ range: selection, text: placeholderText, forceMoveMarkers: true }]);

    client.storage.index.post({ key: file.name, file: file }, { headers: headersWithAuth() })
      .then(({ data }) => {
        if (data) {
          const model = editor.getModel();
          const find = model?.findMatches(`{${id}}`, false, false, false, null, false);
          if (find && find.length > 0) {
            editor.executeEdits("complete", [{ 
              range: find[0].range.setStartPosition(find[0].range.startLineNumber, 1).setEndPosition(find[0].range.startLineNumber, 1000), 
              text: `![${file.name}](${data})` 
            }]);
          }
        }
        setUploading(false);
      });
  };

  const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyB, () => applyStyle('bold'));
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyU, () => applyStyle('underline'));
    editor.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE, () => insertMathTemplate("$公式$", "公式"));

    editor.onKeyDown((e) => {
      const sel = editor.getSelection();
      if (!sel || sel.isEmpty()) return;
      if (e.browserEvent.key === '$' || e.browserEvent.key === '<') {
        e.preventDefault();
        const start = e.browserEvent.key;
        const end = start === '<' ? '>' : '$';
        const model = editor.getModel();
        const text = model?.getValueInRange(sel);
        editor.executeEdits("wrap", [{ range: sel, text: `${start}${text}${end}` }]);
      }
    });

    editor.onDidChangeCursorSelection((e) => {
      checkStyleStatus(editor);
      if (!e.selection.isEmpty()) {
        const coords = editor.getScrolledVisiblePosition(e.selection.getStartPosition());
        if (coords) {
          const rect = editor.getDomNode()?.getBoundingClientRect();
          setBubblePos(rect ? { x: coords.left + rect.left, y: coords.top + rect.top - 65 } : null);
        }
      } else {
        setBubblePos(null);
      }
    });

    editor.onDidChangeModelContent(() => { 
      if (!isComposingRef.current) setContent(editor.getValue()); 
    });
  };

  return (
    <div className="flex flex-col gap-2 relative">
      {/* 悬浮工具栏 */}
      {bubblePos && (
        <div className="fixed z-[100] flex items-center gap-0.5 bg-white dark:bg-zinc-800 shadow-2xl border dark:border-zinc-700 p-1.5 rounded-xl animate-in fade-in zoom-in-95 duration-100"
             style={{ left: bubblePos.x, top: bubblePos.y }}>
          <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" sm />
          <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" sm />
          <ToolbarButton active={activeStyles.underline} onClick={() => applyStyle('underline')} icon="ri-underline" sm />
          <ToolbarButton active={activeStyles.strikethrough} onClick={() => applyStyle('strikethrough')} icon="ri-strikethrough" sm />
          <div className="w-[1px] h-3 bg-gray-200 dark:bg-zinc-700 mx-1" />
          <ToolbarButton active={activeStyles.sup} onClick={() => applyStyle('sup')} icon="ri-superscript" sm />
          <ToolbarButton active={activeStyles.sub} onClick={() => applyStyle('sub')} icon="ri-subscript" sm />
          <div className="w-[1px] h-3 bg-gray-200 dark:bg-zinc-700 mx-1" />
          <button onClick={() => insertMathTemplate("$公式$", "公式")} className="p-1 text-theme hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors">
            <i className="ri-functions text-sm" />
          </button>
        </div>
      )}

      {/* 顶部工具栏 */}
      <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border dark:border-zinc-800">
        <label className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme cursor-pointer" title="上传图片">
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files?.[0])} />
          <i className="ri-image-add-line" />
        </label>
        <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
        
        <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" />
        <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" />
        <ToolbarButton active={activeStyles.underline} onClick={() => applyStyle('underline')} icon="ri-underline" />
        <ToolbarButton active={activeStyles.strikethrough} onClick={() => applyStyle('strikethrough')} icon="ri-strikethrough" />
        <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
        <ToolbarButton active={activeStyles.sup} onClick={() => applyStyle('sup')} icon="ri-superscript" />
        <ToolbarButton active={activeStyles.sub} onClick={() => applyStyle('sub')} icon="ri-subscript" />
        
        <div className="flex-grow" />
        {uploading && <div className="flex items-center gap-2"><Loading type="spin" color="#FC466B" height={16} width={16} /></div>}
        
        <div className="relative group">
          <button className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded flex items-center gap-1">
            <i className="ri-functions" /><i className="ri-arrow-down-s-line text-[10px]" />
          </button>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 w-40 bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-lg shadow-xl py-1">
            {mathSymbols.map(s => (
              <button key={s.label} className="w-full px-3 py-2 text-left text-xs hover:bg-theme hover:text-white transition-colors"
                      onClick={() => insertMathTemplate(s.value, s.placeholder)}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${preview === 'comparison' ? "lg:grid-cols-2" : ""} gap-4`}>
        <div className="border rounded-xl overflow-hidden shadow-inner bg-white dark:bg-[#1e1e1e]" 
             onPaste={(e) => e.clipboardData.files[0] && handleFileUpload(e.clipboardData.files[0])}>
          <Editor onMount={handleEditorMount} height={height} defaultLanguage="markdown" value={content} theme={colorMode === "dark" ? "vs-dark" : "light"}
            options={{ 
                wordWrap: "on", fontSize: 15, minimap: { enabled: false }, 
                smoothScrolling: true, cursorSmoothCaretAnimation: "on",
                autoClosingBrackets: 'always', autoClosingQuotes: 'always' 
            }} 
          />
        </div>
        {preview !== 'edit' && (
          <div className="px-4 py-2 overflow-y-auto border rounded-xl bg-white dark:bg-zinc-950" style={{ height }}>
            <Markdown content={content || placeholder} />
          </div>
        )}
      </div>
    </div>
  );
}

function ToolbarButton({ active, onClick, icon, sm }: { active?: boolean, onClick: () => void, icon: string, sm?: boolean }) {
  return (
    <button 
      onClick={onClick} 
      className={`rounded transition-all ${sm ? 'p-1' : 'p-1.5'} ${active ? 'bg-theme text-white shadow-md' : 'hover:bg-gray-200 dark:hover:bg-zinc-700 dark:text-gray-300'}`}
    >
      <i className={`${icon} ${sm ? 'text-xs' : 'text-base'}`} />
    </button>
  );
}
