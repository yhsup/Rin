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

export function MarkdownEditor({ content, setContent, placeholder = "> 开始创作...", height = "600px" }: any) {
  const { t } = useTranslation();
  const colorMode = useColorMode();
  const editorRef = useRef<editor.IStandaloneCodeEditor>();
  const emojiButtonRef = useRef<HTMLDivElement>(null);
  
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<'edit' | 'preview' | 'comparison'>('edit');
  const [activeStyles, setActiveStyles] = useState<Record<string, boolean>>({});
  const [bubblePos, setBubblePos] = useState<{ x: number, y: number } | null>(null);
  const [showEmojiPanel, setShowEmojiPanel] = useState(false);

  // 公式模板
  const mathSymbols = [
    { label: "行内公式", value: "$公式$", placeholder: "公式" },
    { label: "块级公式", value: "\n$$\n公式内容\n$$\n", placeholder: "公式内容" },
    { label: "分式", value: "$\\frac{分子}{分母}$", placeholder: "分子" },
    { label: "根号", value: "$\\sqrt{x}$", placeholder: "x" },
    { label: "求和", value: "$\\sum_{i=1}^{n}$", placeholder: "i=1" },
  ];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiButtonRef.current && !emojiButtonRef.current.contains(e.target as Node)) setShowEmojiPanel(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* ================= 核心修复逻辑开始 ================= */

  // 1. 洋葱剥皮法检测样式 (支持多重高亮)
  const checkStyleStatus = useCallback((editorInst: editor.IStandaloneCodeEditor) => {
    const model = editorInst.getModel();
    const selection = editorInst.getSelection();
    if (!model || !selection) return;

    let text = model.getValueInRange(selection).trim();
    const styles: Record<string, boolean> = {
      bold: false, italic: false, underline: false, 
      strikethrough: false, sup: false, sub: false, code: false
    };

    // 循环剥离外层标签，直到剥无可剥
    let changed = true;
    while (changed && text.length > 0) {
      changed = false;
      
      // 代码块 (优先级最高，因为包含特殊字符)
      if ((text.startsWith('```') && text.endsWith('```')) || (text.startsWith('`') && text.endsWith('`') && !text.startsWith('```'))) {
        styles.code = true;
        text = text.startsWith('```') ? text.slice(3, -3).trim() : text.slice(1, -1).trim();
        changed = true;
        continue;
      }
      
      // HTML 标签类
      if (text.startsWith('<u>') && text.endsWith('</u>')) {
        styles.underline = true;
        text = text.slice(3, -4).trim();
        changed = true;
        continue;
      }
      if (text.startsWith('<sup>') && text.endsWith('</sup>')) {
        styles.sup = true;
        text = text.slice(5, -6).trim();
        changed = true;
        continue;
      }
      if (text.startsWith('<sub>') && text.endsWith('</sub>')) {
        styles.sub = true;
        text = text.slice(5, -6).trim();
        changed = true;
        continue;
      }
      if (text.startsWith('~~') && text.endsWith('~~')) {
        styles.strikethrough = true;
        text = text.slice(2, -2).trim();
        changed = true;
        continue;
      }

      // Markdown 核心冲突区 (加粗 vs 斜体)
      // 优先检测最长的符号 *** (Bold+Italic)
      // 注意：这里我们分别标记，不剥离整个 ***，而是剥离外层，让下一次循环处理内层
      if (text.startsWith('***') && text.endsWith('***')) {
        // 既是粗体也是斜体，剥离一层 *，剩下 ** 交给下一轮
        styles.italic = true;
        text = text.slice(1, -1).trim();
        changed = true;
        continue;
      }
      
      if (text.startsWith('**') && text.endsWith('**')) {
        styles.bold = true;
        text = text.slice(2, -2).trim();
        changed = true;
        continue;
      }

      if (text.startsWith('*') && text.endsWith('*')) {
        styles.italic = true;
        text = text.slice(1, -1).trim();
        changed = true;
        continue;
      }
    }

    setActiveStyles(styles);
  }, []);

  // 2. 智能样式应用 (解决嵌套冲突)
  const applyStyle = useCallback((type: string) => {
    const editorInst = editorRef.current;
    if (!editorInst) return;
    const model = editorInst.getModel()!;
    const selection = editorInst.getSelection()!;
    const rawText = model.getValueInRange(selection);
    const text = rawText.trim(); // 处理两端空格，防止判断失效

    // 定义样式规则
    const styleRules: any = {
      bold: { tag: '**' },
      italic: { tag: '*' },
      underline: { tag: '<u>', end: '</u>' },
      strikethrough: { tag: '~~' },
      sup: { tag: '<sup>', end: '</sup>' },
      sub: { tag: '<sub>', end: '</sub>' },
      code: { tag: '```\n', end: '\n```' },
      table: { tag: "\n| 标题1 | 标题2 |\n| --- | --- |\n| 内容 | 内容 |\n" }
    };

    const s = styleRules[type];

    // 特殊处理：表格
    if (type === 'table') {
      editorInst.executeEdits("insert", [{ range: selection, text: s.tag, forceMoveMarkers: true }]);
      editorInst.focus();
      return;
    }

    // 核心逻辑：判断当前文本是否【真的】包裹了该样式
    const startTag = s.tag;
    const endTag = s.end || s.tag;
    let isWrapped = false;

    if (type === 'italic') {
      // 斜体特殊判断：必须排除 "看起来像斜体实际上是粗体" 的情况
      const isBold = text.startsWith('**') && text.endsWith('**');
      const isBoldItalic = text.startsWith('***') && text.endsWith('***');
      // 如果是 ***，那是斜体包裹。如果是 ** 但不是 ***，那【不是】斜体包裹。
      if (text.startsWith('*') && text.endsWith('*')) {
        if (isBold && !isBoldItalic) isWrapped = false;
        else isWrapped = true;
      }
    } else {
      // 其他样式正常判断
      isWrapped = text.startsWith(startTag) && text.endsWith(endTag);
    }

    let newText = "";
    if (isWrapped) {
      // 移除样式（保留中间内容）
      // 注意：这里要操作 rawText 的 trim 后的部分，保持首尾空格不动比较复杂
      // 简单起见，我们替换整个 rawText，这可能会导致选中区域的空格被吃掉，但在 Monaco 中通常不是问题
      newText = text.substring(startTag.length, text.length - endTag.length);
    } else {
      // 添加样式（包裹）
      newText = `${startTag}${text}${endTag}`;
    }

    editorInst.executeEdits("style", [{ range: selection, text: newText, forceMoveMarkers: true }]);
    
    // 修正选中区域：让选中区域包含新生成的标签，这样用户可以连续点击
    // 比如点 Bold 变成 **text**，选中区扩大，再点 Italic 识别到 **text** 再次包裹
    const lengthDiff = newText.length - rawText.length;
    editorInst.setSelection(new Selection(
      selection.startLineNumber, 
      selection.startColumn, 
      selection.endLineNumber, 
      selection.endColumn + lengthDiff
    ));

    editorInst.focus();
    setTimeout(() => checkStyleStatus(editorInst), 50);
  }, [checkStyleStatus]);

  /* ================= 核心修复逻辑结束 ================= */

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
          if (find?.[0]) editorInst.executeEdits("", [{ range: find[0].range.setStartPosition(find[0].range.startLineNumber, 1).setEndPosition(find[0].range.startLineNumber, 1000), text: `![${file.name}](${data})` }]);
        }
        setUploading(false);
      }).catch(() => setUploading(false));
  }, []);

  const handleEditorMount = (editorInst: editor.IStandaloneCodeEditor) => {
    editorRef.current = editorInst;
    editorInst.addCommand(KeyMod.CtrlCmd | KeyCode.KeyB, () => applyStyle('bold'));
    editorInst.addCommand(KeyMod.CtrlCmd | KeyCode.KeyI, () => applyStyle('italic'));
    editorInst.addCommand(KeyMod.CtrlCmd | KeyCode.KeyU, () => applyStyle('underline')); // 增加下划线快捷键

    editorInst.onKeyDown((e) => {
      const sel = editorInst.getSelection();
      if ((!sel || sel.isEmpty()) && e.browserEvent.key === '<') {
        setTimeout(() => {
          editorInst.executeEdits("", [{ range: editorInst.getSelection()!, text: ">" }]);
          editorInst.setPosition({ lineNumber: editorInst.getPosition()!.lineNumber, column: editorInst.getPosition()!.column - 1 });
        }, 10);
      }
      if (sel && !sel.isEmpty() && (e.browserEvent.key === '$' || e.browserEvent.key === '<')) {
        e.preventDefault();
        const end = e.browserEvent.key === '<' ? '>' : '$';
        editorInst.executeEdits("", [{ range: sel, text: `${e.browserEvent.key}${editorInst.getModel()?.getValueInRange(sel)}${end}` }]);
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
      <div className="flex flex-row space-x-2 items-center">
        <div className="flex bg-gray-100 dark:bg-zinc-800 p-1 rounded-lg">
          {(['edit', 'preview', 'comparison'] as const).map((m) => (
            <button key={m} onClick={() => setPreview(m)} className={`px-3 py-1 text-xs rounded-md ${preview === m ? "bg-white dark:bg-zinc-700 text-theme shadow-sm" : "text-gray-500"}`}>{t(m)}</button>
          ))}
        </div>
        {uploading && <Loading type="spin" color="#FC466B" height={14} width={14} />}
      </div>

      <div className={`flex flex-wrap items-center gap-1 p-2 bg-gray-50 dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl ${preview === 'preview' ? 'hidden' : ''}`}>
        <label className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme cursor-pointer"><input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files?.[0])} /><i className="ri-image-add-line" /></label>
        <div className="relative" ref={emojiButtonRef}>
          <button onClick={() => setShowEmojiPanel(!showEmojiPanel)} className="p-1.5 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded text-theme"><i className="ri-emotion-happy-line" /></button>
          {showEmojiPanel && <div className="absolute top-full left-0 z-50 mt-2 shadow-2xl"><EmojiPicker onEmojiClick={(d) => { editorRef.current?.executeEdits("", [{range: editorRef.current.getSelection()!, text: d.emoji}]); setShowEmojiPanel(false); }} theme={colorMode === 'dark' ? Theme.DARK : Theme.LIGHT} /></div>}
        </div>
        
        <div className="w-[1px] h-4 bg-gray-300 dark:bg-zinc-700 mx-1" />
        
        <ToolbarButton active={activeStyles.bold} onClick={() => applyStyle('bold')} icon="ri-bold" />
        <ToolbarButton active={activeStyles.italic} onClick={() => applyStyle('italic')} icon="ri-italic" />
        <ToolbarButton active={activeStyles.underline} onClick={() => applyStyle('underline')} icon="ri-underline" />
        <ToolbarButton active={activeStyles.strikethrough} onClick={() => applyStyle('strikethrough')} icon="ri-strikethrough" />
        <ToolbarButton active={activeStyles.sup} onClick={() => applyStyle('sup')} icon="ri-superscript" />
        <ToolbarButton active={activeStyles.sub} onClick={() => applyStyle('sub')} icon="ri-subscript" />
        <ToolbarButton active={activeStyles.code} onClick={() => applyStyle('code')} icon="ri-code-s-slash-line" title="代码块" />
        <ToolbarButton onClick={() => applyStyle('table')} icon="ri-table-2" title="表格" />

        <div className="flex-grow" />

        <div className="relative group p-1">
          <button className="text-theme font-bold flex items-center gap-1"><i className="ri-functions" /><i className="ri-arrow-down-s-line text-[10px]" /></button>
          <div className="absolute right-0 top-full pt-1 hidden group-hover:block z-50">
            <div className="w-40 bg-white dark:bg-zinc-900 border dark:border-zinc-700 rounded-lg shadow-xl py-1">
              {mathSymbols.map(s => <button key={s.label} className="w-full px-4 py-2 text-left text-xs hover:bg-theme hover:text-white" onClick={() => { editorRef.current?.executeEdits("", [{range: editorRef.current.getSelection()!, text: s.value}]); editorRef.current?.focus(); }}>{s.label}</button>)}
            </div>
          </div>
        </div>
      </div>

      <div className={`grid gap-4 ${preview === 'comparison' ? 'lg:grid-cols-2' : 'grid-cols-1'}`}>
        <div className={`border rounded-xl overflow-hidden ${preview === 'preview' ? 'hidden' : ''}`} onPaste={(e) => { const f = e.clipboardData.files[0]; if(f) handleFileUpload(f); }}>
          <Editor height={height} defaultLanguage="markdown" theme={colorMode === 'dark' ? 'vs-dark' : 'light'} value={content} onMount={handleEditorMount} options={{ wordWrap: 'on', minimap: { enabled: false }, fontSize: 15 }} />
        </div>
        <div className={`px-6 py-4 border rounded-xl overflow-y-auto bg-white dark:bg-zinc-900 ${preview === 'edit' ? 'hidden' : ''}`} style={{ height }}><Markdown content={content || placeholder} /></div>
      </div>

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
