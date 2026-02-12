import Editor, { loader } from '@monaco-editor/react';
import { editor, Selection, KeyMod, KeyCode } from 'monaco-editor';
import { useRef, useState, useCallback, useEffect } from "react";
import Loading from 'react-loading';
import { useTranslation } from "react-i18next";
import { useColorMode } from "../utils/darkModeUtils";
import { Markdown } from "./markdown";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";
import EmojiPicker, { Theme } from 'emoji-picker-react';

loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs' } });

interface MarkdownEditorProps {
  content: string;
  setContent: (content: string) => void;
  placeholder?: string;
  height?: string;
}

export function MarkdownEditor({ content, setContent, placeholder = "> Write...", height = "600px" }: MarkdownEditorProps) {
  const { t } = useTranslation();
  const colorMode = useColorMode();
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const emojiButtonRef = useRef<HTMLDivElement>(null);
  
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<'edit' | 'preview' | 'comparison'>('edit');
  const [activeStyles, setActiveStyles] = useState<Record<string, boolean>>({});
  const [bubblePos, setBubblePos] = useState<{ x: number, y: number } | null>(null);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);

  const mathSymbols = [
    { label: "行内公式 (Inline)", value: "$公式$", placeholder: "公式" },
    { label: "块级公式 (Block)", value: "\n$$\n公式内容\n$$\n", placeholder: "公式内容" },
    { label: "分式 (frac)", value: "$\\frac{分子}{分母}$", placeholder: "分子" },
    { label: "根号 (sqrt)", value: "$\\sqrt{内容}$", placeholder: "内容" },
  ];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiButtonRef.current && !emojiButtonRef.current.contains(e.target as Node)) setShowEmojiPanel(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ---------------- 核心逻辑修复区 ---------------- */

  // 1. 精确检测样式状态 (支持嵌套)
  const checkStyleStatus = useCallback((editorInst: editor.IStandaloneCodeEditor) => {
    const model = editorInst.getModel();
    const selection = editorInst.getSelection();
    if (!model || !selection) return;

    const selectedText = model.getValueInRange(selection);
    
    // 这里的逻辑改为：只有当选中的文字【完全被该标签包裹】时，才判定为激活
    const check = (tag: string, endTag?: string) => {
      const et = endTag || tag;
      const trimmed = selectedText.trim();
      return trimmed.startsWith(tag) && trimmed.endsWith(et);
    };

    setActiveStyles({
      bold: check('**'),
      italic: check('*') && !check('**'), // 排除加粗干扰
      underline: check('<u>', '</u>'),
      strikethrough: check('~~'),
      sup: check('<sup>', '</sup>'),
      sub: check('<sub>', '</sub>'),
      code: check('```', '```') || (check('`', '`') && !check('```')),
    });
  }, []);

  // 2. 独立样式应用 (防止误删其他样式)
  const applyStyle = useCallback((type: string) => {
    const editorInst = editorRef.current;
    if (!editorInst) return;
    const model = editorInst.getModel()!;
    const selection = editorInst.getSelection()!;
    const selectedText = model.getValueInRange(selection);

    const styleMap: Record<string, { tag: string; end?: string }> = {
      bold: { tag: '**' },
      italic: { tag: '*' },
      underline: { tag: '<u>', end: '</u>' },
      strikethrough: { tag: '~~' },
      sup: { tag: '<sup>', end: '</sup>' },
      sub: { tag: '<sub>', end: '</sub>' },
      code: { tag: '```\n', end: '\n```' },
      table: { tag: "\n| 标题 | 标题 |\n| --- | --- |\n| 内容 | 内容 |\n" }
    };

    const s = styleMap[type];
    if (type === 'table') {
      editorInst.executeEdits("insert", [{ range: selection, text: s.tag, forceMoveMarkers: true }]);
    } else {
      const startTag = s.tag;
      const endTag = s.end || s.tag;
      
      // 判断是否已经应用了【当前点击】的这个样式
      const isRemoving = selectedText.trim().startsWith(startTag) && selectedText.trim().endsWith(endTag);
      
      let newText = "";
      if (isRemoving) {
        // 只剥离当前样式的外壳，保留内部文字（含其他样式）
        const contentInside = selectedText.trim().substring(startTag.length, selectedText.trim().length - endTag.length);
        newText = contentInside;
      } else {
        // 在现有文字（含其他样式）外层包裹新样式
        newText = `${startTag}${selectedText}${endTag}`;
      }

      editorInst.executeEdits("style", [{ range: selection, text: newText, forceMoveMarkers: true }]);
      
      // 重新计算选中区域
      const delta = newText.length - selectedText.length;
      editorInst.setSelection(new Selection(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn + delta));
    }
    editorInst.focus();
    setTimeout(() => checkStyleStatus(editorInst), 50);
  }, [checkStyleStatus]);

  /* ---------------- 其他功能保留 ---------------- */

  const insertMathTemplate = useCallback((template: string, placeholderStr?: string) => {
    const editorInst = editorRef.current;
    if (!editorInst) return;
    const selection = editorInst.getSelection()!;
    const model = editorInst.getModel()!;
    const selectedText = model.getValueInRange(selection);
    let textToInsert = template;
    if (selectedText && placeholderStr && selectedText !== placeholderStr) {
        textToInsert = template.replace(placeholderStr, selectedText);
    }
    editorInst.executeEdits("insert", [{ range: selection, text: textToInsert, forceMoveMarkers: true }]);
    editorInst.focus();
  }, []);

  const handleFileUpload = (file: File) => {
    const editorInst = editorRef.current;
    if (!editorInst) return;
    setUploading(true);
    const id = Math.random().toString(36).substring(7);
    editorInst.executeEdits("upload", [{ range: editorInst.getSelection()!, text: `\n![正在上传...{${id}}]()\n`, forceMoveMarkers: true }]);
    client.storage.index.post({ key: file.name, file: file }, { headers: headersWithAuth() })
      .then(({ data }) => {
        if (data) {
          const find = editorInst.getModel()?.findMatches(`{${id}}`, false, false, false, null, false);
          if (find?.[0]) editorInst.executeEdits("complete", [{ range: find[0].range.setStartPosition(find[0].range.startLineNumber, 1).setEndPosition(find[0].range.startLineNumber, 1000), text: `![${file.name}](${data as string})` }]);
        }
        setUploading(false);
      });
  };

  const handleEditorMount = (editorInst: editor.IStandaloneCodeEditor) => {
    editorRef.current = editorInst;
    editorInst.onKeyDown((e) => {
      const sel = editorInst.getSelection();
      // Smart Auto-Pairing < >
      if ((!sel || sel.isEmpty()) && e.browserEvent.key === '<') {
        setTimeout(() => {
          editorInst.executeEdits("close", [{ range: editorInst.getSelection()!, text: ">", forceMoveMarkers: false }]);
          editorInst.setPosition({ lineNumber: editorInst.getPosition()!.lineNumber, column: editorInst.getPosition()!.column - 1 });
        }, 10);
      }
      // Wrap $ and <
      if (sel && !sel.isEmpty() && (e.browserEvent.key === '$' || e.browserEvent.key === '<')) {
        e.preventDefault();
        const end = e.browserEvent.key === '<' ? '>' : '$';
        editorInst.executeEdits("wrap", [{ range: sel, text: `${e.browserEvent.key}${model?.getValueInRange(sel)}${end}` }]);
      }
    });
    editorInst.onDidChangeCursorSelection((e) => {
      checkStyleStatus(editorInst);
      if (!e.selection.isEmpty() && preview !== 'preview') {
        const coords = editorInst.getScrolledVisiblePosition(e.selection.getStartPosition());
        const rect = editorInst.getDomNode()?.getBoundingClientRect();
        if (coords && rect) setBubblePos({ x: coords.left + rect.left, y: coords.top + rect.top - 65 });
      } else setBubblePos(null);
    });
    const model = editorInst.getModel();
    editorInst.onDidChangeModelContent(() => setContent(editorInst.getValue()));
  };

  return (
    <div className="flex flex-col gap-2 relative">
      {/* 视图切换 */}
      <div className="flex flex-row space-x-2 mb-1 items-center">
        <div className="flex bg-gray-100 dark:bg-zinc-800 p-1 rounded-lg">
          {(['edit', 'preview', 'comparison'] as const).map((m) => (
            <button key={m} onClick={() => setPreview(m)} className={`px-3 py-1 text-xs rounded-md ${preview === m ? "bg-white dark:bg-zinc-700 text-theme shadow-sm" : "text-gray-500"}`}>{t(m)}</button>
          ))}
        </div>
        {uploading && <Loading type="spin" color="#FC466B" height={14} width={14} />}
      </div>

      {/* 主工具栏 */}
      <div className={`flex flex-wrap items-center gap-1 p-2 bg-gray-50 dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl ${preview === 'preview' ? 'hidden' : ''}`}>
        <ToolbarButton onClick={() => setShowEmojiPanel(!showEmojiPanel)} icon="ri-emotion-happy-line" />
        <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
        <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" />
        <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" />
        <ToolbarButton active={activeStyles.underline} onClick={() => applyStyle('underline')} icon="ri-underline" />
        <ToolbarButton active={activeStyles.strikethrough} onClick={() => applyStyle('strikethrough')} icon="ri-strikethrough" />
        <ToolbarButton active={activeStyles.sup} onClick={() => applyStyle('sup')} icon="ri-superscript" />
        <ToolbarButton active={activeStyles.sub} onClick={() => applyStyle('sub')} icon="ri-subscript" />
        <ToolbarButton active={activeStyles.code} onClick={() => applyStyle('code')} icon="ri-code-s-slash-line" />
        <ToolbarButton onClick={() => applyStyle('table')} icon="ri-table-2" />
        <div className="flex-grow" />
        {/* 公式菜单 */}
        <div className="relative group p-1">
          <button className="text-theme font-bold flex items-center gap-1"><i className="ri-functions" /><i className="ri-arrow-down-s-line text-[10px]" /></button>
          <div className="absolute right-0 top-full pt-1 hidden group-hover:block z-50">
            <div className="w-40 bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-lg shadow-xl py-1">
              {mathSymbols.map(s => <button key={s.label} className="w-full px-4 py-2 text-left text-xs hover:bg-theme hover:text-white" onClick={() => insertMathTemplate(s.value, s.placeholder)}>{s.label}</button>)}
            </div>
          </div>
        </div>
      </div>

      {/* 编辑器区域 */}
      <div className={`grid gap-4 ${preview === 'comparison' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        <div className={`border rounded-xl overflow-hidden ${preview === 'preview' ? 'hidden' : ''}`}>
          <Editor height={height} defaultLanguage="markdown" theme={colorMode === 'dark' ? 'vs-dark' : 'light'} value={content} onMount={handleEditorMount} options={{ wordWrap: 'on', minimap: { enabled: false }, fontSize: 15 }} />
        </div>
        <div className={`px-6 py-4 border rounded-xl overflow-y-auto bg-white dark:bg-zinc-900 ${preview === 'edit' ? 'hidden' : ''}`} style={{ height }}><Markdown content={content || placeholder} /></div>
      </div>

      {/* 增强型悬浮气泡栏 */}
      {bubblePos && (
        <div className="fixed z-[100] flex items-center bg-white dark:bg-zinc-800 shadow-2xl p-1.5 rounded-xl border dark:border-zinc-700 animate-in zoom-in-95 gap-0.5" style={{ left: bubblePos.x, top: bubblePos.y }}>
          <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" sm />
          <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" sm />
          <ToolbarButton active={activeStyles.underline} onClick={() => applyStyle('underline')} icon="ri-underline" sm />
          <ToolbarButton active={activeStyles.strikethrough} onClick={() => applyStyle('strikethrough')} icon="ri-strikethrough" sm />
          <ToolbarButton active={activeStyles.sup} onClick={() => applyStyle('sup')} icon="ri-superscript" sm />
          <ToolbarButton active={activeStyles.sub} onClick={() => applyStyle('sub')} icon="ri-subscript" sm />
          <div className="w-[1px] h-3 bg-gray-200 dark:bg-zinc-700 mx-0.5" />
          <ToolbarButton active={activeStyles.code} onClick={() => applyStyle('code')} icon="ri-code-s-slash-line" sm />
        </div>
      )}

      {/* Emoji Panel */}
      {showEmojiPanel && (
        <div className="absolute z-50" style={{ left: emojiButtonRef.current?.offsetLeft, top: (emojiButtonRef.current?.offsetTop || 0) + 40 }}>
          <EmojiPicker onEmojiClick={(d) => { editorRef.current?.executeEdits("", [{range: editorRef.current.getSelection()!, text: d.emoji}]); setShowEmojiPanel(false); }} theme={colorMode === 'dark' ? Theme.DARK : Theme.LIGHT} />
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ active, onClick, icon, sm }: { active?: boolean, onClick: () => void, icon: string, sm?: boolean }) {
  return (
    <button onClick={onClick} className={`rounded transition-all ${sm ? 'p-1' : 'p-1.5'} ${active ? 'bg-theme text-white shadow-md' : 'hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-gray-300'}`}>
      <i className={`${icon} ${sm ? 'text-xs' : 'text-base'}`} />
    </button>
  );
}
