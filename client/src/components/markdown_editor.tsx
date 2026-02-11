import Editor, { loader } from '@monaco-editor/react';
import { editor, Selection, KeyMod, KeyCode } from 'monaco-editor';
import { useRef, useState, useCallback, useEffect } from "react";
import Loading from 'react-loading';
import { useTranslation } from "react-i18next";
import { useColorMode } from "../utils/darkModeUtils"; // 假设你的项目有此工具
import { Markdown } from "./markdown"; // 假设你的渲染组件
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";
import EmojiPicker, { Theme, EmojiStyle } from 'emoji-picker-react';

// 配置 Monaco CDN
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs' } });

/* ---------------- 默认数据配置 ---------------- */

const DEFAULT_STICKERS = [
  {
    name: "默认表情",
    stickers: [
      { label: "Doge", url: "https://img.icons8.com/color/96/doge.png" },
      { label: "Cat", url: "https://img.icons8.com/color/96/bongo-cat.png" },
      { label: "Pepe", url: "https://img.icons8.com/color/96/pepe.png" },
      { label: "Ok", url: "https://img.icons8.com/fluency/96/ok-hand.png" },
    ]
  }
];

const MATH_SYMBOLS = [
  { label: "行内公式", value: "$公式$", placeholder: "公式" },
  { label: "块级公式", value: "\n$$\n公式内容\n$$\n", placeholder: "公式内容" },
  { label: "分式 (frac)", value: "$\\frac{分子}{分母}$", placeholder: "分子" },
  { label: "根号 (sqrt)", value: "$\\sqrt{内容}$", placeholder: "内容" },
  { label: "矩阵 (matrix)", value: "$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$", placeholder: "a" },
];

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
  height = "600px"
}: MarkdownEditorProps) {
  const { t } = useTranslation();
  const colorMode = useColorMode();
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const emojiButtonRef = useRef<HTMLDivElement>(null);

  // 状态管理
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<'edit' | 'preview' | 'comparison'>('edit');
  const [activeStyles, setActiveStyles] = useState<Record<string, boolean>>({});
  const [bubblePos, setBubblePos] = useState<{ x: number, y: number } | null>(null);

  // Emoji & Stickers 状态
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [activeEmojiTab, setActiveEmojiTab] = useState<'emoji' | 'sticker'>('emoji');
  const [stickerGroups, setStickerGroups] = useState(DEFAULT_STICKERS);
  const [newPackUrl, setNewPackUrl] = useState("");
  const [isAddingPack, setIsAddingPack] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);

  /* ---------------- 初始化逻辑 ---------------- */

  // 从本地加载自定义表情包
  useEffect(() => {
    const saved = localStorage.getItem('custom_stickers');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setStickerGroups([...DEFAULT_STICKERS, ...parsed]);
      } catch (e) { console.error(e); }
    }
    
    // 点击外部关闭表情面板
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiButtonRef.current && !emojiButtonRef.current.contains(e.target as Node)) {
        setShowEmojiPanel(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ---------------- 编辑器核心逻辑 ---------------- */

  // 检查当前光标处的样式激活状态
  const checkStyleStatus = useCallback((editor: editor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    const selection = editor.getSelection();
    if (!model || !selection) return;

    const line = model.getLineContent(selection.startLineNumber);
    const startCol = selection.startColumn;

    const isWrapped = (tag: string, endTag?: string) => {
      const et = endTag || tag;
      const leftPart = line.substring(Math.max(0, startCol - 1 - tag.length), startCol - 1);
      const selectedText = model.getValueInRange(selection);
      return leftPart === tag || selectedText.startsWith(tag) && selectedText.endsWith(et);
    };

    setActiveStyles({
      bold: isWrapped('**'),
      italic: isWrapped('*') || isWrapped('_'),
      underline: isWrapped('<u>', '</u>'),
      strikethrough: isWrapped('~~'),
      sup: isWrapped('<sup>', '</sup>'),
      sub: isWrapped('<sub>', '</sub>'),
    });
  }, []);

  const applyStyle = useCallback((type: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel()!;
    const selection = editor.getSelection()!;
    const selectedText = model.getValueInRange(selection);

    const styleMap: any = {
      bold: { tag: '**', reg: /\*\*/g },
      italic: { tag: '*', reg: /\*/g },
      underline: { tag: '<u>', end: '</u>', reg: /<\/?u>/g },
      strikethrough: { tag: '~~', reg: /~~/g },
      sup: { tag: '<sup>', end: '</sup>', reg: /<\/?sup>/g },
      sub: { tag: '<sub>', end: '</sub>', reg: /<\/?sub>/g },
      table: { tag: "\n| 标题 | 标题 |\n| --- | --- |\n| 内容 | 内容 |\n" }
    };

    const s = styleMap[type];
    if (type === 'table') {
      editor.executeEdits("insert", [{ range: selection, text: s.tag, forceMoveMarkers: true }]);
    } else {
      const endTag = s.end || s.tag;
      const isRemoving = selectedText.includes(s.tag);
      const newText = isRemoving ? selectedText.replace(s.reg, '') : `${s.tag}${selectedText}${endTag}`;
      editor.executeEdits("style", [{ range: selection, text: newText, forceMoveMarkers: true }]);
    }
    editor.focus();
    setTimeout(() => checkStyleStatus(editor), 50);
  }, [checkStyleStatus]);

  /* ---------------- 表情包与 Emoji 逻辑 ---------------- */

  const handleInsertEmoji = (emojiData: any) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.executeEdits("emoji", [{ range: editor.getSelection()!, text: emojiData.emoji, forceMoveMarkers: true }]);
    editor.focus();
  };

  const handleInsertSticker = (sticker: { label: string, url: string }) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.executeEdits("sticker", [{ range: editor.getSelection()!, text: `![${sticker.label}](${sticker.url})`, forceMoveMarkers: true }]);
    setShowEmojiPanel(false);
    editor.focus();
  };

  const addStickerPackByUrl = async () => {
    if (!newPackUrl) return;
    setIsAddingPack(true);
    try {
      const res = await fetch(newPackUrl);
      const data = await res.json();
      if (data.name && data.stickers) {
        const updated = [...stickerGroups.filter(g => g.name !== '默认表情'), data];
        localStorage.setItem('custom_stickers', JSON.stringify(updated));
        setStickerGroups([...DEFAULT_STICKERS, ...updated]);
        setNewPackUrl("");
        setShowAddInput(false);
      }
    } catch (e) {
      alert("加载失败，请检查 URL 或跨域设置");
    } finally {
      setIsAddingPack(false);
    }
  };

  /* ---------------- 编辑器配置 ---------------- */

  const handleEditorMount = (editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;

    // 快捷键绑定
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyB, () => applyStyle('bold'));
    editor.addCommand(KeyMod.CtrlCmd | KeyCode.KeyI, () => applyStyle('italic'));

    // 智能配对与包裹逻辑 ($ 和 <)
    editor.onKeyDown((e) => {
      const sel = editor.getSelection();
      if (!sel || sel.isEmpty()) {
        // 自动闭合逻辑：输入 < 自动补全 >
        if (e.browserEvent.key === '<') {
          setTimeout(() => {
            editor.executeEdits("close", [{ range: editor.getSelection()!, text: ">", forceMoveMarkers: false }]);
            const pos = editor.getPosition();
            if (pos) editor.setPosition({ lineNumber: pos.lineNumber, column: pos.column - 1 });
          }, 10);
        }
        return;
      }
      
      // 选中文字包裹逻辑
      if (e.browserEvent.key === '$' || e.browserEvent.key === '<') {
        e.preventDefault();
        const endChar = e.browserEvent.key === '<' ? '>' : '$';
        const model = editor.getModel()!;
        const text = model.getValueInRange(sel);
        editor.executeEdits("wrap", [{ range: sel, text: `${e.browserEvent.key}${text}${endChar}` }]);
      }
    });

    editor.onDidChangeCursorSelection((e) => {
      checkStyleStatus(editor);
      // 气泡菜单逻辑
      if (!e.selection.isEmpty() && preview !== 'preview') {
        const coords = editor.getScrolledVisiblePosition(e.selection.getStartPosition());
        const rect = editor.getDomNode()?.getBoundingClientRect();
        if (coords && rect) setBubblePos({ x: coords.left + rect.left, y: coords.top + rect.top - 60 });
      } else { setBubblePos(null); }
    });
  };

  return (
    <div className="flex flex-col gap-2 relative">
      {/* 顶部预览模式切换 */}
      <div className="flex bg-gray-100 dark:bg-zinc-800 p-1 rounded-lg self-start">
        {(['edit', 'preview', 'comparison'] as const).map((m) => (
          <button key={m} onClick={() => setPreview(m)} className={`px-4 py-1 text-xs rounded-md transition-all ${preview === m ? "bg-white dark:bg-zinc-700 shadow-sm text-theme" : "text-gray-500"}`}>
            {t(m)}
          </button>
        ))}
      </div>

      {/* 主工具栏 */}
      <div className={`flex flex-wrap items-center gap-1 p-2 bg-gray-50 dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl ${preview === 'preview' ? 'hidden' : ''}`}>
        
        {/* Emoji & 表情包按钮 */}
        <div className="relative" ref={emojiButtonRef}>
          <button onClick={() => setShowEmojiPanel(!showEmojiPanel)} className="p-2 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme">
            <i className="ri-emotion-happy-line text-lg" />
          </button>
          
          {showEmojiPanel && (
            <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-xl shadow-2xl w-[350px] overflow-hidden flex flex-col">
              <div className="flex border-b dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800">
                <button onClick={() => setActiveEmojiTab('emoji')} className={`flex-1 py-2 text-xs ${activeEmojiTab === 'emoji' ? 'border-b-2 border-theme text-theme' : ''}`}>Emoji</button>
                <button onClick={() => setActiveEmojiTab('sticker')} className={`flex-1 py-2 text-xs ${activeEmojiTab === 'sticker' ? 'border-b-2 border-theme text-theme' : ''}`}>表情包</button>
              </div>
              
              <div className="h-[350px] overflow-hidden">
                {activeEmojiTab === 'emoji' ? (
                  <EmojiPicker onEmojiClick={handleInsertEmoji} theme={colorMode === 'dark' ? Theme.DARK : Theme.LIGHT} width="100%" height="350px" />
                ) : (
                  <div className="h-full flex flex-col">
                    <div className="flex-1 overflow-y-auto p-3">
                      {stickerGroups.map(group => (
                        <div key={group.name} className="mb-4">
                          <p className="text-[10px] text-gray-400 font-bold mb-2 uppercase">{group.name}</p>
                          <div className="grid grid-cols-4 gap-2">
                            {group.stickers.map((s, idx) => (
                              <button key={idx} onClick={() => handleInsertSticker(s)} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded">
                                <img src={s.url} alt={s.label} className="w-full aspect-square object-contain" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-2 border-t dark:border-zinc-700">
                      {!showAddInput ? (
                        <button onClick={() => setShowAddInput(true)} className="w-full py-1 text-xs border-dashed border rounded border-gray-300 text-gray-400">+ 导入表情包 (JSON URL)</button>
                      ) : (
                        <div className="flex gap-1">
                          <input value={newPackUrl} onChange={e => setNewPackUrl(e.target.value)} placeholder="URL..." className="flex-1 text-xs p-1 rounded border dark:bg-zinc-800" />
                          <button onClick={addStickerPackByUrl} className="px-2 bg-theme text-white rounded text-xs">{isAddingPack ? '...' : 'OK'}</button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
        
        {/* 基础样式按钮 (状态感应) */}
        <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" />
        <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" />
        <ToolbarButton active={activeStyles.underline} onClick={() => applyStyle('underline')} icon="ri-underline" />
        <ToolbarButton active={activeStyles.strikethrough} onClick={() => applyStyle('strikethrough')} icon="ri-strikethrough" />
        <ToolbarButton active={activeStyles.sup} onClick={() => applyStyle('sup')} icon="ri-superscript" />
        <ToolbarButton active={activeStyles.sub} onClick={() => applyStyle('sub')} icon="ri-subscript" />
        <ToolbarButton onClick={() => applyStyle('table')} icon="ri-table-line" />
      </div>

      {/* 编辑区 */}
      <div className={`grid gap-4 ${preview === 'comparison' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        <div className={`border rounded-xl overflow-hidden bg-white dark:bg-[#1e1e1e] ${preview === 'preview' ? 'hidden' : ''}`}>
          <Editor 
            height={height}
            defaultLanguage="markdown"
            theme={colorMode === 'dark' ? 'vs-dark' : 'light'}
            value={content}
            onChange={(v) => setContent(v || "")}
            onMount={handleEditorMount}
            options={{ wordWrap: 'on', minimap: { enabled: false }, fontSize: 15, autoClosingBrackets: 'always' }}
          />
        </div>
        
        <div className={`px-6 py-4 border rounded-xl overflow-y-auto bg-white dark:bg-zinc-900 ${preview === 'edit' ? 'hidden' : ''}`} style={{ height }}>
          <Markdown content={content || placeholder} />
        </div>
      </div>

      {/* 悬浮气泡菜单 */}
      {bubblePos && (
        <div className="fixed z-[100] flex bg-white dark:bg-zinc-800 shadow-2xl p-1 rounded-lg border border-gray-200 dark:border-zinc-700 animate-in zoom-in-95" style={{ left: bubblePos.x, top: bubblePos.y }}>
          <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" sm />
          <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" sm />
          <button onClick={() => applyStyle('underline')} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded text-theme"><i className="ri-functions text-xs" /></button>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ active, onClick, icon, sm }: { active?: boolean, onClick: () => void, icon: string, sm?: boolean }) {
  return (
    <button 
      onClick={onClick} 
      className={`rounded transition-all ${sm ? 'p-1' : 'p-2'} ${active ? 'bg-theme text-white' : 'hover:bg-gray-200 dark:hover:bg-zinc-700 dark:text-gray-300 text-gray-600'}`}
    >
      <i className={`${icon} ${sm ? 'text-xs' : 'text-lg'}`} />
    </button>
  );
}
