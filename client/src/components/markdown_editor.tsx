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

  // --- 修复版：状态感应逻辑 ---
  const checkStyleStatus = useCallback((editor: editor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection) return;

    // 获取当前行或选区附近的文本
    const line = model.getLineContent(selection.startLineNumber);
    const startCol = selection.startColumn;
    const endCol = selection.endColumn;

    // 辅助函数：检测文本是否被指定符号包裹（考虑选区内外）
    const isWrapped = (tag: string) => {
      // 检查光标左侧是否有 tag，右侧是否有 tag
      const leftText = line.substring(Math.max(0, startCol - 1 - tag.length), startCol - 1);
      const rightText = line.substring(endCol - 1, endCol - 1 + tag.length);
      
      // 或者检查选区内的首尾
      const selectedText = model.getValueInRange(selection);
      const inSelection = selectedText.startsWith(tag) && selectedText.endsWith(tag);
      
      return leftText === tag || inSelection;
    };

    // 针对星号的特殊逻辑：计算星号密度
    const getStarCount = () => {
      let count = 0;
      for (let i = 3; i >= 1; i--) {
        const stars = "*".repeat(i);
        if (isWrapped(stars)) { count = i; break; }
      }
      return count;
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

  // --- 修复版：样式叠加逻辑 ---
  const applyStyle = useCallback((type: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;
    const selectedText = model.getValueInRange(selection);

    const styleMap: any = {
      bold: { tag: '**', reg: /^\*\*([\s\S]*)\*\*$/ },
      italic: { tag: '*', reg: /^\*([\s\S]*)\*$/ },
      underline: { tag: '<u>', end: '</u>', reg: /^<u>([\s\S]*)<\/u>$/ },
      strikethrough: { tag: '~~', reg: /^~~([\s\S]*)~~$/ },
      sup: { tag: '<sup>', end: '</sup>', reg: /^<sup>([\s\S]*)<\/sup>$/ },
      sub: { tag: '<sub>', end: '</sub>', reg: /^<sub>([\s\S]*)<\/sub>$/ },
    };

    const s = styleMap[type];
    const endTag = s.end || s.tag;
    
    // 如果已经有该样式，则去掉它；如果没有，则包裹它
    const isRemoving = s.reg.test(selectedText);
    const newText = isRemoving 
      ? selectedText.replace(s.reg, '$1') 
      : `${s.tag}${selectedText}${endTag}`;
    
    editor.executeEdits("style", [{ range: selection, text: newText, forceMoveMarkers: true }]);
    
    // 重新选中文字，方便连续操作
    if (!isRemoving) {
        const newSelection = new Selection(
            selection.startLineNumber, selection.startColumn,
            selection.endLineNumber, selection.endColumn + s.tag.length + endTag.length
        );
        editor.setSelection(newSelection);
    }

    setTimeout(() => checkStyleStatus(editor), 50);
    editor.focus();
  }, [checkStyleStatus]);

  // --- 其他功能保留 ---
  const insertMathTemplate = useCallback((template: string, placeholder?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    if (!selection || !model) return;
    const selectedText = model.getValueInRange(selection);
    let textToInsert = template;
    if (selectedText === "公式" || selectedText === "公式内容") {
      textToInsert = template.replace(/^\$/, '').replace(/\$$/, '');
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
          if (find?.[0]) {
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
      if (!e.selection.isEmpty()) {
        const coords = editor.getScrolledVisiblePosition(e.selection.getStartPosition());
        const rect = editor.getDomNode()?.getBoundingClientRect();
        if (coords && rect) setBubblePos({ x: coords.left + rect.left, y: coords.top + rect.top - 65 });
      } else {
        setBubblePos(null);
      }
    });

    editor.onDidChangeModelContent(() => { if (!isComposingRef.current) setContent(editor.getValue()); });
  };

  return (
    <div className="flex flex-col gap-2 relative">
      {bubblePos && (
        <div className="fixed z-[100] flex items-center gap-0.5 bg-white dark:bg-zinc-800 shadow-2xl border dark:border-zinc-700 p-1.5 rounded-xl animate-in fade-in zoom-in-95"
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

      <div className="flex flex-wrap items-center gap-1 p-2 bg-gray-50 dark:bg-zinc-900/50 rounded-xl border dark:border-zinc-800">
        <label className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme cursor-pointer">
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
        {uploading && <Loading type="spin" color="#FC466B" height={16} width={16} />}
        <div className="relative group">
          <button className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded flex items-center gap-1">
            <i className="ri-functions" /><i className="ri-arrow-down-s-line text-[10px]" />
          </button>
          <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-50 w-40 bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-lg shadow-xl py-1">
            {mathSymbols.map(s => (
              <button key={s.label} className="w-full px-3 py-2 text-left text-xs hover:bg-theme hover:text-white"
                      onClick={() => insertMathTemplate(s.value, s.placeholder)}>{s.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${preview === 'comparison' ? "lg:grid-cols-2" : ""} gap-4`}>
        <div className="border rounded-xl overflow-hidden shadow-inner bg-white dark:bg-[#1e1e1e]" 
             onPaste={(e) => e.clipboardData.files[0] && handleFileUpload(e.clipboardData.files[0])}>
          <Editor onMount={handleEditorMount} height={height} defaultLanguage="markdown" value={content} theme={colorMode === "dark" ? "vs-dark" : "light"}
            options={{ wordWrap: "on", fontSize: 15, minimap: { enabled: false }, smoothScrolling: true, cursorSmoothCaretAnimation: "on" }} 
          />
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({ active, onClick, icon, sm }: { active?: boolean, onClick: () => void, icon: string, sm?: boolean }) {
  return (
    <button onClick={onClick} className={`rounded transition-all ${sm ? 'p-1' : 'p-1.5'} ${active ? 'bg-theme text-white' : 'hover:bg-gray-200 dark:hover:bg-zinc-700'}`}>
      <i className={`${icon} ${sm ? 'text-xs' : 'text-base'}`} />
    </button>
  );
}
