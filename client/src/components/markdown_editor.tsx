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

export function MarkdownEditor({ content, setContent, placeholder = "> 开始书写...", height = "600px" }: MarkdownEditorProps) {
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

  /* ---------------- 核心逻辑：样式检测 (Active State) ---------------- */
  const checkStyleStatus = useCallback((editorInst: editor.IStandaloneCodeEditor) => {
    const model = editorInst.getModel();
    const selection = editorInst.getSelection();
    if (!model || !selection) return;

    const text = model.getValueInRange(selection).trim();
    
    // 采用包含检测，确保嵌套时图标都能亮起
    setActiveStyles({
      bold: text.includes('**'),
      italic: text.replace(/\*\*/g, '').includes('*'), // 排除加粗后的星号
      underline: text.includes('<u>'),
      strikethrough: text.includes('~~'),
      sup: text.includes('<sup>'),
      sub: text.includes('<sub>'),
      code: text.includes('`'),
    });
  }, []);

  /* ---------------- 核心逻辑：样式应用 (Toggle & Wrap) ---------------- */
  const applyStyle = useCallback((type: string) => {
    const editorInst = editorRef.current;
    if (!editorInst) return;
    const model = editorInst.getModel()!;
    const selection = editorInst.getSelection()!;
    const rawText = model.getValueInRange(selection);
    const text = rawText.trim();

    const styleMap: any = {
      bold: { tag: '**' },
      italic: { tag: '*' },
      underline: { tag: '<u>', end: '</u>' },
      strikethrough: { tag: '~~' },
      sup: { tag: '<sup>', end: '</sup>' },
      sub: { tag: '<sub>', end: '</sub>' },
      code: { tag: '```\n', end: '\n```' },
      table: { tag: "\n| 标题 | 标题 |\n| --- | --- |\n| 内容 | 内容 |\n" }
    };

    if (type === 'table') {
      editorInst.executeEdits("insert", [{ range: selection, text: styleMap.table.tag, forceMoveMarkers: true }]);
      return;
    }

    const { tag, end } = styleMap[type];
    const startTag = tag;
    const endTag = end || tag;

    let newText = "";
    
    // 情况 1: 精准取消 (处理 *** 情况)
    if (type === 'bold' && text.startsWith('***') && text.endsWith('***')) {
      newText = `*${text.slice(3, -3)}*`; 
    } else if (type === 'italic' && text.startsWith('***') && text.endsWith('***')) {
      newText = `**${text.slice(3, -3)}**`;
    } 
    // 情况 2: 标准取消 (最外层匹配)
    else if (text.startsWith(startTag) && text.endsWith(endTag)) {
      newText = text.substring(startTag.length, text.length - endTag.length);
    } 
    // 情况 3: 叠加包裹
    else {
      newText = `${startTag}${text}${endTag}`;
    }

    editorInst.executeEdits("style", [{ range: selection, text: newText, forceMoveMarkers: true }]);
    
    const delta = newText.length - rawText.length;
    editorInst.setSelection(new Selection(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn + delta));
    
    editorInst.focus();
    setTimeout(() => checkStyleStatus(editorInst), 50);
  }, [checkStyleStatus]);

  /* ---------------- 功能函数：图片、公式、Emoji ---------------- */
  const handleFileUpload = useCallback((file: File) => {
    const editorInst = editorRef.current;
    if (!editorInst) return;
    setUploading(true);
    const id = Math.random().toString(36).substring(7);
    editorInst.executeEdits("upload", [{ range: editorInst.getSelection()!, text: `\n![上传中...{${id}}]()\n` }]);
    
    client.storage.index.post({ key: file.name, file: file }, { headers: headersWithAuth() })
      .then(({ data }: any) => {
        if (data) {
          const find = editorInst.getModel()?.findMatches(`{${id}}`, false, false, false, null, false);
          if (find?.[0]) {
            editorInst.executeEdits("complete", [{ range: find[0].range.setStartPosition(find[0].range.startLineNumber, 1).setEndPosition(find[0].range.startLineNumber, 1000), text: `![${file.name}](${data})` }]);
          }
        }
        setUploading(false);
      }).catch(() => setUploading(false));
  }, []);

  const handleEditorMount = (editorInst: editor.IStandaloneCodeEditor) => {
    editorRef.current = editorInst;
    
    // 快捷键定义
    editorInst.addCommand(KeyMod.CtrlCmd | KeyCode.KeyB, () => applyStyle('bold'));
    editorInst.addCommand(KeyMod.CtrlCmd | KeyCode.KeyI, () => applyStyle('italic'));
    editorInst.addCommand(KeyMod.CtrlCmd | KeyCode.KeyU, () => applyStyle('underline'));

    editorInst.onKeyDown((e) => {
      const sel = editorInst.getSelection();
      const model = editorInst.getModel();
      
      // 记忆需求：< 自动闭合
      if ((!sel || sel.isEmpty()) && e.browserEvent.key === '<') {
        setTimeout(() => {
          editorInst.executeEdits("pair", [{ range: editorInst.getSelection()!, text: ">" }]);
          const pos = editorInst.getPosition();
          if (pos) editorInst.setPosition({ lineNumber: pos.lineNumber, column: pos.column - 1 });
        }, 10);
      }
      
      // 记忆需求：选中包裹 $ 和 <
      if (sel && !sel.isEmpty() && (e.browserEvent.key === '$' || e.browserEvent.key === '<')) {
        e.preventDefault();
        const end = e.browserEvent.key === '<' ? '>' : '$';
        const innerText = model?.getValueInRange(sel) || "";
        editorInst.executeEdits("wrap", [{ range: sel, text: `${e.browserEvent.key}${innerText}${end}` }]);
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

    editorInst.onDidChangeModelContent(() => setContent(editorInst.getValue()));
  };

  return (
    <div className="flex flex-col gap-2 relative">
      <div className="flex flex-row space-x-2 items-center justify-between">
        <div className="flex bg-gray-100 dark:bg-zinc-800 p-1 rounded-lg">
          {(['edit', 'preview', 'comparison'] as const).map((m) => (
            <button key={m} onClick={() => setPreview(m)} className={`px-3 py-1 text-xs rounded-md ${preview === m ? "bg-white dark:bg-zinc-700 text-theme shadow-sm" : "text-gray-500"}`}>{t(m)}</button>
          ))}
        </div>
        {uploading && <Loading type="spin" color="#FC466B" height={14} width={14} />}
      </div>

      {/* 主工具栏 */}
      <div className={`flex flex-wrap items-center gap-1 p-2 bg-gray-50 dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl ${preview === 'preview' ? 'hidden' : ''}`}>
        <label className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme cursor-pointer" title="上传图片">
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files?.[0])} />
          <i className="ri-image-add-line" />
        </label>
        
        <div className="relative" ref={emojiButtonRef}>
          <button onClick={() => setShowEmojiPanel(!showEmojiPanel)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme" title="Emoji">
            <i className="ri-emotion-happy-line text-lg" />
          </button>
          {showEmojiPanel && (
            <div className="absolute top-full left-0 mt-2 z-50 shadow-2xl">
              <EmojiPicker onEmojiClick={(d) => { editorRef.current?.executeEdits("", [{range: editorRef.current.getSelection()!, text: d.emoji}]); setShowEmojiPanel(false); }} theme={colorMode === 'dark' ? Theme.DARK : Theme.LIGHT} />
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
        
        <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" title="加粗" />
        <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" title="斜体" />
        <ToolbarButton active={activeStyles.underline} onClick={() => applyStyle('underline')} icon="ri-underline" title="下划线" />
        <ToolbarButton active={activeStyles.strikethrough} onClick={() => applyStyle('strikethrough')} icon="ri-strikethrough" title="中划线" />
        <ToolbarButton active={activeStyles.sup} onClick={() => applyStyle('sup')} icon="ri-superscript" title="上标" />
        <ToolbarButton active={activeStyles.sub} onClick={() => applyStyle('sub')} icon="ri-subscript" title="下标" />
        <ToolbarButton active={activeStyles.code} onClick={() => applyStyle('code')} icon="ri-code-s-slash-line" title="代码块" />
        <ToolbarButton onClick={() => applyStyle('table')} icon="ri-table-2" title="表格" />

        <div className="flex-grow" />

        <div className="relative group p-1">
          <button className="text-theme font-bold flex items-center gap-1" title="数学公式"><i className="ri-functions" /><i className="ri-arrow-down-s-line text-[10px]" /></button>
          <div className="absolute right-0 top-full pt-1 hidden group-hover:block z-50">
            <div className="w-40 bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-lg shadow-xl py-1">
              {mathSymbols.map(s => (
                <button key={s.label} className="w-full px-4 py-2 text-left text-xs hover:bg-theme hover:text-white" 
                  onClick={() => { editorRef.current?.executeEdits("", [{range: editorRef.current.getSelection()!, text: s.value}]); editorRef.current?.focus(); }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 编辑器与预览 */}
      <div className={`grid gap-4 ${preview === 'comparison' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        <div className={`border rounded-xl overflow-hidden ${preview === 'preview' ? 'hidden' : ''}`} 
             onPaste={(e) => { const f = e.clipboardData.files[0]; if(f) handleFileUpload(f); }}>
          <Editor height={height} defaultLanguage="markdown" theme={colorMode === 'dark' ? 'vs-dark' : 'light'} value={content} onMount={handleEditorMount} 
                  options={{ wordWrap: 'on', minimap: { enabled: false }, fontSize: 15, lineNumbers: 'off', padding: { top: 10 } }} />
        </div>
        <div className={`px-6 py-4 border rounded-xl overflow-y-auto bg-white dark:bg-zinc-900 ${preview === 'edit' ? 'hidden' : ''}`} style={{ height }}>
          <Markdown content={content || placeholder} />
        </div>
      </div>

      {/* 悬浮气泡菜单 */}
      {bubblePos && (
        <div className="fixed z-[100] flex items-center bg-white dark:bg-zinc-800 shadow-2xl p-1.5 rounded-xl border dark:border-zinc-700 gap-0.5" style={{ left: bubblePos.x, top: bubblePos.y }}>
          <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" sm />
          <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" sm />
          <ToolbarButton active={activeStyles.underline} onClick={() => applyStyle('underline')} icon="ri-underline" sm />
          <ToolbarButton active={activeStyles.strikethrough} onClick={() => applyStyle('strikethrough')} icon="ri-strikethrough" sm />
          <ToolbarButton active={activeStyles.sup} onClick={() => applyStyle('sup')} icon="ri-superscript" sm />
          <ToolbarButton active={activeStyles.sub} onClick={() => applyStyle('sub')} icon="ri-subscript" sm />
          <div className="w-[1px] h-3 bg-gray-200 dark:bg-zinc-700 mx-0.5" />
          <ToolbarButton active={activeStyles.code} onClick={() => applyStyle('code')} icon="ri-code-s-slash-line" sm />
          <button onClick={() => { editorRef.current?.executeEdits("", [{range: editorRef.current.getSelection()!, text: "$公式$"}]); editorRef.current?.focus(); }} className="p-1 text-theme hover:bg-gray-100 dark:hover:bg-zinc-700 rounded"><i className="ri-functions text-xs" /></button>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ active, onClick, icon, sm, title }: any) {
  return (
    <button title={title} onClick={onClick} className={`rounded transition-all ${sm ? 'p-1' : 'p-1.5'} ${active ? 'bg-theme text-white shadow-md' : 'hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-gray-300'}`}>
      <i className={`${icon} ${sm ? 'text-xs' : 'text-base'}`} />
    </button>
  );
}
