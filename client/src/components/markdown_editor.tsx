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

// 配置 Monaco CDN
loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.43.0/min/vs' } });

/* ---------------- 类型定义 ---------------- */

interface Sticker {
  label: string;
  url: string;
}

interface StickerGroup {
  name: string;
  stickers: Sticker[];
}

interface MarkdownEditorProps {
  content: string;
  setContent: (content: string) => void;
  placeholder?: string;
  height?: string;
}

/* ---------------- 默认数据配置 ---------------- */

const DEFAULT_STICKERS: StickerGroup[] = [
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
  const isComposingRef = useRef(false);

  // 状态管理
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<'edit' | 'preview' | 'comparison'>('edit');
  const [activeStyles, setActiveStyles] = useState<Record<string, boolean>>({});
  const [bubblePos, setBubblePos] = useState<{ x: number, y: number } | null>(null);

  // Emoji & Stickers 状态
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);
  const [activeEmojiTab, setActiveEmojiTab] = useState<'emoji' | 'sticker'>('emoji');
  const [stickerGroups, setStickerGroups] = useState<StickerGroup[]>(DEFAULT_STICKERS);
  const [newPackUrl, setNewPackUrl] = useState("");
  const [isAddingPack, setIsAddingPack] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);

  // 公式模板库
  const mathSymbols = [
    { label: "行内公式 (Inline)", value: "$公式$", placeholder: "公式" },
    { label: "块级公式 (Block)", value: "\n$$\n公式内容\n$$\n", placeholder: "公式内容" },
    { label: "分式 (frac)", value: "$\\frac{分子}{分母}$", placeholder: "分子" },
    { label: "根号 (sqrt)", value: "$\\sqrt{内容}$", placeholder: "内容" },
    { label: "求和 (sum)", value: "$\\sum_{i=1}^{n} x_i$", placeholder: "x_i" },
    { label: "定积分 (int)", value: "$\\int_{a}^{b} f(x) dx$", placeholder: "f(x)" },
    { label: "矩阵 (matrix)", value: "$\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}$", placeholder: "a" },
  ];

  /* ---------------- 初始化逻辑 ---------------- */

  useEffect(() => {
    const saved = localStorage.getItem('custom_stickers');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setStickerGroups([...DEFAULT_STICKERS, ...parsed]);
      } catch (e) { console.error(e); }
    }
    
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiButtonRef.current && !emojiButtonRef.current.contains(e.target as Node)) {
        setShowEmojiPanel(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ---------------- 编辑器核心逻辑 ---------------- */

  const checkStyleStatus = useCallback((editorInst: editor.IStandaloneCodeEditor) => {
    const model = editorInst.getModel();
    const selection = editorInst.getSelection();
    if (!model || !selection) return;

    const line = model.getLineContent(selection.startLineNumber);
    const startCol = selection.startColumn;

    const isWrapped = (tag: string, endTag?: string) => {
      const et = endTag || tag;
      const leftPart = line.substring(Math.max(0, startCol - 1 - tag.length), startCol - 1);
      const selectedText = model.getValueInRange(selection);
      return leftPart === tag || (selectedText.startsWith(tag) && selectedText.endsWith(et));
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
    const editorInst = editorRef.current;
    if (!editorInst) return;
    const model = editorInst.getModel()!;
    const selection = editorInst.getSelection()!;
    const selectedText = model.getValueInRange(selection);

    const styleMap: Record<string, { tag: string; end?: string; reg?: RegExp }> = {
      bold: { tag: '**', reg: /\*\*/g },
      italic: { tag: '*', reg: /\*/g },
      underline: { tag: '<u>', end: '</u>', reg: /<\/?u>/g },
      strikethrough: { tag: '~~', reg: /~~/g },
      sup: { tag: '<sup>', end: '</sup>', reg: /<\/?sup>/g },
      sub: { tag: '<sub>', end: '</sub>', reg: /<\/?sub>/g },
      table: { tag: "\n| 标题1 | 标题2 |\n| --- | --- |\n| 单元格1 | 单元格2 |\n" }
    };

    const s = styleMap[type];
    if (type === 'table') {
      editorInst.executeEdits("insert", [{ range: selection, text: s.tag, forceMoveMarkers: true }]);
    } else {
      const endTag = s.end || s.tag;
      const isRemoving = selectedText.includes(s.tag);
      const newText = isRemoving ? selectedText.replace(s.reg!, '') : `${s.tag}${selectedText}${endTag}`;
      editorInst.executeEdits("style", [{ range: selection, text: newText, forceMoveMarkers: true }]);
      const delta = newText.length - selectedText.length;
      editorInst.setSelection(new Selection(selection.startLineNumber, selection.startColumn, selection.endLineNumber, selection.endColumn + delta));
    }
    editorInst.focus();
    setTimeout(() => checkStyleStatus(editorInst), 50);
  }, [checkStyleStatus]);

  const insertMathTemplate = useCallback((template: string, placeholderStr?: string) => {
    const editorInst = editorRef.current;
    if (!editorInst || !editorInst.getModel()) return;
    const selection = editorInst.getSelection()!;
    const model = editorInst.getModel()!;
    const selectedText = model.getValueInRange(selection);
    let textToInsert = template;
    
    if (selectedText === "公式" || selectedText === "公式内容") {
        textToInsert = template.replace(/^\$?\$?/, '').replace(/\$?\$?$/, '');
    } else if (selectedText && placeholderStr && selectedText !== placeholderStr) {
        textToInsert = template.replace(placeholderStr, selectedText);
    }

    editorInst.executeEdits("insert", [{ range: selection, text: textToInsert, forceMoveMarkers: true }]);
    
    if (placeholderStr && (!selectedText || selectedText === "公式")) {
      setTimeout(() => {
        const matches = model.findMatches(placeholderStr, true, false, false, null, false);
        const currentPos = editorInst.getPosition();
        const nearest = matches.find(m => m.range.startLineNumber === (currentPos?.lineNumber || 0));
        if (nearest) editorInst.setSelection(nearest.range);
      }, 50);
    }
    editorInst.focus();
  }, []);

  const handleFileUpload = (file: File) => {
    const editorInst = editorRef.current;
    if (!editorInst) return;
    setUploading(true);
    const id = Math.random().toString(36).substring(7);
    const placeholderText = `\n![⌛ 正在上传... {${id}}]()\n`;
    editorInst.executeEdits("upload", [{ range: editorInst.getSelection()!, text: placeholderText, forceMoveMarkers: true }]);
    
    client.storage.index.post({ key: file.name, file: file }, { headers: headersWithAuth() })
      .then(({ data }) => {
        if (data) {
          const find = editorInst.getModel()?.findMatches(`{${id}}`, false, false, false, null, false);
          if (find?.[0]) {
            editorInst.executeEdits("complete", [{ 
                range: find[0].range.setStartPosition(find[0].range.startLineNumber, 1).setEndPosition(find[0].range.startLineNumber, 1000), 
                text: `![${file.name}](${data as string})` 
            }]);
          }
        }
        setUploading(false);
      });
  };

  const handleEditorMount = (editorInst: editor.IStandaloneCodeEditor) => {
    editorRef.current = editorInst;

    editorInst.addCommand(KeyMod.CtrlCmd | KeyCode.KeyB, () => applyStyle('bold'));
    editorInst.addCommand(KeyMod.CtrlCmd | KeyCode.KeyI, () => applyStyle('italic'));
    editorInst.addCommand(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyE, () => insertMathTemplate("$公式$", "公式"));

    editorInst.onKeyDown((e) => {
      const sel = editorInst.getSelection();
      if (!sel || sel.isEmpty()) {
        if (e.browserEvent.key === '<') {
          setTimeout(() => {
            editorInst.executeEdits("close", [{ range: editorInst.getSelection()!, text: ">", forceMoveMarkers: false }]);
            const pos = editorInst.getPosition();
            if (pos) editorInst.setPosition({ lineNumber: pos.lineNumber, column: pos.column - 1 });
          }, 10);
        }
        return;
      }
      
      if (e.browserEvent.key === '$' || e.browserEvent.key === '<') {
        e.preventDefault();
        const endChar = e.browserEvent.key === '<' ? '>' : '$';
        const model = editorInst.getModel()!;
        const text = model.getValueInRange(sel);
        editorInst.executeEdits("wrap", [{ range: sel, text: `${e.browserEvent.key}${text}${endChar}` }]);
      }
    });

    editorInst.onDidChangeCursorSelection((e) => {
      checkStyleStatus(editorInst);
      if (!e.selection.isEmpty() && preview !== 'preview') {
        const coords = editorInst.getScrolledVisiblePosition(e.selection.getStartPosition());
        const rect = editorInst.getDomNode()?.getBoundingClientRect();
        if (coords && rect) setBubblePos({ x: coords.left + rect.left, y: coords.top + rect.top - 65 });
      } else { setBubblePos(null); }
    });

    editorInst.onDidChangeModelContent(() => { if (!isComposingRef.current) setContent(editorInst.getValue()); });
  };

  const addStickerPackByUrl = async () => {
    if (!newPackUrl) return;
    setIsAddingPack(true);
    try {
      const res = await fetch(newPackUrl);
      const data = (await res.json()) as StickerGroup;
      if (data.name && data.stickers) {
        const customPacks = stickerGroups.filter(g => g.name !== '默认表情');
        setStickerGroups([...DEFAULT_STICKERS, ...customPacks, data]);
        localStorage.setItem('custom_stickers', JSON.stringify([...customPacks, data]));
        setNewPackUrl("");
        setShowAddInput(false);
      }
    } catch (e) { alert("加载失败"); } finally { setIsAddingPack(false); }
  };

  return (
    <div className="flex flex-col mx-4 my-2 md:mx-0 md:my-0 gap-2 relative">
      <div className="flex flex-row space-x-2 mb-1 px-1 items-center">
        <div className="flex bg-gray-100 dark:bg-zinc-800 p-1 rounded-lg">
          {(['edit', 'preview', 'comparison'] as const).map((m) => (
            <button key={m} onClick={() => setPreview(m)} className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${preview === m ? "bg-white dark:bg-zinc-700 shadow-sm text-theme" : "text-gray-500"}`}>
              {t(m)}
            </button>
          ))}
        </div>
        <div className="flex-grow" />
        {uploading && (
          <div className="flex items-center gap-2">
            <Loading type="spin" color="#FC466B" height={14} width={14} />
            <span className="text-xs text-theme font-medium animate-pulse">{t('uploading')}</span>
          </div>
        )}
      </div>

      <div className={`flex flex-wrap items-center gap-1 p-2 bg-gray-50 dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl ${preview === 'preview' ? 'hidden' : ''}`}>
        <label className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme cursor-pointer" title="上传图片">
          <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files?.[0])} />
          <i className="ri-image-add-line" />
        </label>
        
        <div className="relative" ref={emojiButtonRef}>
          <button onClick={() => setShowEmojiPanel(!showEmojiPanel)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme">
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
                  <EmojiPicker onEmojiClick={(d) => { editorRef.current?.executeEdits("", [{range: editorRef.current.getSelection()!, text: d.emoji}]); editorRef.current?.focus(); }} theme={colorMode === 'dark' ? Theme.DARK : Theme.LIGHT} width="100%" height="350px" />
                ) : (
                  <div className="h-full flex flex-col">
                    <div className="flex-1 overflow-y-auto p-3">
                      {stickerGroups.map(group => (
                        <div key={group.name} className="mb-4">
                          <p className="text-[10px] text-gray-400 font-bold mb-2 uppercase">{group.name}</p>
                          <div className="grid grid-cols-4 gap-2">
                            {group.stickers.map((s, idx) => (
                              <button key={idx} onClick={() => { editorRef.current?.executeEdits("", [{range: editorRef.current.getSelection()!, text: `![${s.label}](${s.url})`}]); setShowEmojiPanel(false); }} className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded">
                                <img src={s.url} alt={s.label} className="w-full aspect-square object-contain" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-2 border-t dark:border-zinc-700">
                      {!showAddInput ? (
                        <button onClick={() => setShowAddInput(true)} className="w-full py-1 text-xs border-dashed border rounded border-gray-300 text-gray-400">+ 导入表情包</button>
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
        <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" />
        <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" />
        <ToolbarButton active={activeStyles.underline} onClick={() => applyStyle('underline')} icon="ri-underline" />
        <ToolbarButton active={activeStyles.strikethrough} onClick={() => applyStyle('strikethrough')} icon="ri-strikethrough" />
        <ToolbarButton active={activeStyles.sup} onClick={() => applyStyle('sup')} icon="ri-superscript" />
        <ToolbarButton active={activeStyles.sub} onClick={() => applyStyle('sub')} icon="ri-subscript" />
        <ToolbarButton onClick={() => applyStyle('table')} icon="ri-table-2" title="插入表格" />

        <div className="flex-grow" />
        
        {/* 公式菜单 */}
        <div className="relative group py-1 px-1">
          <button className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded flex items-center gap-1 text-theme font-bold">
            <i className="ri-functions" />
            <i className="ri-arrow-down-s-line text-[10px]" />
          </button>
          <div className="absolute right-0 top-full pt-1 hidden group-hover:block z-50">
            <div className="w-48 bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-lg shadow-2xl py-1 overflow-y-auto max-h-[300px]">
              {mathSymbols.map(s => (
                <button key={s.label} className="w-full px-4 py-2 text-left text-xs hover:bg-theme hover:text-white transition-colors flex justify-between items-center" onClick={() => insertMathTemplate(s.value, s.placeholder)}>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={`grid gap-4 ${preview === 'comparison' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        <div className={`border rounded-xl overflow-hidden bg-white dark:bg-[#1e1e1e] ${preview === 'preview' ? 'hidden' : ''}`} onPaste={(e) => e.clipboardData.files[0] && handleFileUpload(e.clipboardData.files[0])}>
          <Editor height={height} defaultLanguage="markdown" theme={colorMode === 'dark' ? 'vs-dark' : 'light'} value={content} onChange={(v) => setContent(v || "")} onMount={handleEditorMount} options={{ wordWrap: 'on', minimap: { enabled: false }, fontSize: 15, autoClosingBrackets: 'always' }} />
        </div>
        <div className={`px-6 py-4 border rounded-xl overflow-y-auto bg-white dark:bg-zinc-900 ${preview === 'edit' ? 'hidden' : ''}`} style={{ height }}>
          <Markdown content={content || placeholder} />
        </div>
      </div>

      {bubblePos && (
        <div className="fixed z-[100] flex bg-white dark:bg-zinc-800 shadow-2xl p-1.5 rounded-xl border dark:border-zinc-700 animate-in zoom-in-95" style={{ left: bubblePos.x, top: bubblePos.y }}>
          <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" sm />
          <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" sm />
          <ToolbarButton active={activeStyles.underline} onClick={() => applyStyle('underline')} icon="ri-underline" sm />
          <button onClick={() => insertMathTemplate("$公式$", "公式")} className="p-1 text-theme hover:bg-gray-100 dark:hover:bg-zinc-700 rounded"><i className="ri-functions text-sm" /></button>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({ active, onClick, icon, sm, title }: { active?: boolean, onClick: () => void, icon: string, sm?: boolean, title?: string }) {
  return (
    <button title={title} onClick={onClick} className={`rounded transition-all ${sm ? 'p-1' : 'p-1.5'} ${active ? 'bg-theme text-white shadow-md' : 'hover:bg-gray-200 dark:hover:bg-zinc-700 dark:text-gray-300 text-gray-600'}`}>
      <i className={`${icon} ${sm ? 'text-xs' : 'text-base'}`} />
    </button>
  );
}
