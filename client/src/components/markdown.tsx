import "katex/dist/katex.min.css";
import React, { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  base16AteliersulphurpoolLight,
  vscDarkPlus,
} from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import gfm from "remark-gfm";
import remarkMermaid from "../remark/remarkMermaid";
import { remarkAlert } from "remark-github-blockquote-alert";
import remarkMath from "remark-math";
import Lightbox, { SlideImage } from "yet-another-react-lightbox";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import { useColorMode } from "../utils/darkModeUtils";

// 工具函数保持不变
const countNewlinesBeforeNode = (text: string, offset: number) => {
  let newlinesBefore = 0;
  for (let i = offset - 1; i >= 0; i--) {
    if (text[i] === "\n") newlinesBefore++;
    else break;
  }
  return newlinesBefore;
};

const isMarkdownImageLinkAtEnd = (text: string) => {
  const trimmed = text.trim();
  const match = trimmed.match(/(.*)(!\\[.*?\\]\\(.*?\\))$/s);
  return match ? (match[1].trim().length === 0 || match[1].endsWith("\n")) : false;
};

// 样式解析补丁
const parseInlineStyle = (style: any): React.CSSProperties => {
  if (typeof style !== 'string') return style || {};
  const styleObj: any = {};
  style.split(';').forEach(rule => {
    const [key, value] = rule.split(':');
    if (key && value) {
      const camelKey = key.trim().replace(/-([a-z])/g, g => g[1].toUpperCase());
      let finalValue = value.trim().replace(/&quot;/g, '').replace(/"/g, '');
      
      if (camelKey === 'fontFamily') {
        if (finalValue.includes('Zhi Mang Xing')) finalValue = "'Zhi Mang Xing', cursive";
        else if (finalValue.includes('Ma Shan Zheng')) finalValue = "'Ma Shan Zheng', cursive";
        else if (finalValue.includes('Noto Serif SC')) finalValue = "'Noto Serif SC', serif";
      }
      styleObj[camelKey] = finalValue;
    }
  });

  if (styleObj.fontSize || styleObj.lineHeight || styleObj.fontFamily) {
    styleObj.display = 'inline-block';
    styleObj.maxWidth = '100%';
  }
  return styleObj;
};

export function Markdown({ content }: { content: string }) {
  const colorMode = useColorMode();
  const [index, setIndex] = React.useState(-1);
  const slides = useRef<SlideImage[]>();
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. 动态加载字体资源（防止 @import 被拦截）
  useEffect(() => {
    const fontId = 'rin-google-fonts';
    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');
      link.id = fontId;
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;700&family=Zhi+Mang+Xing&display=swap';
      document.head.appendChild(link);
    }
  }, []);

  // 2. 暴力监听修正逻辑
  useEffect(() => {
    const fixStyles = () => {
      if (!containerRef.current) return;
      const elements = containerRef.current.querySelectorAll('.toc-content span[style]');
      elements.forEach((el) => {
        const target = el as HTMLElement;
        const styleStr = target.getAttribute('style') || '';
        if (styleStr.includes('Zhi Mang Xing')) target.style.setProperty('font-family', "'Zhi Mang Xing', cursive", 'important');
        if (styleStr.includes('Noto Serif SC')) target.style.setProperty('font-family', "'Noto Serif SC', serif", 'important');
        if (styleStr.includes('Ma Shan Zheng')) target.style.setProperty('font-family', "'Ma Shan Zheng', cursive", 'important');
        
        if (styleStr.includes('font-size') || styleStr.includes('line-height')) {
            target.style.setProperty('display', 'inline-block', 'important');
        }
      });
    };

    fixStyles();
    const observer = new MutationObserver(fixStyles);
    if (containerRef.current) observer.observe(containerRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [content]);

  const show = (src: string | undefined) => {
    let slidesLocal = slides.current;
    if (!slidesLocal) {
      if (!containerRef.current) return;
      const images = containerRef.current.querySelectorAll("img");
      slidesLocal = Array.from(images).map(img => ({
        src: img.getAttribute("src") || "",
        alt: img.getAttribute("alt") || "",
        imageFit: "contain" as const,
        download: { url: img.getAttribute("src") || "", filename: "image" },
      })).filter(s => s.src !== "");
      slides.current = slidesLocal;
    }
    setIndex(slidesLocal?.findIndex(s => s.src === src) ?? -1);
  };

  const Content = useMemo(() => (
    <div ref={containerRef} className="markdown-render-wrapper">
      <style>{`
        /* 使用极其粗暴的通用选择器补丁 */
        .toc-content span[style*="Zhi Mang Xing"] { font-family: 'Zhi Mang Xing', cursive !important; display: inline-block !important; }
        .toc-content span[style*="Noto Serif SC"] { font-family: 'Noto Serif SC', serif !important; display: inline-block !important; }
        .toc-content span[style*="Ma Shan Zheng"] { font-family: 'Ma Shan Zheng', cursive !important; display: inline-block !important; }
        
        .toc-content { white-space: pre-wrap !important; word-break: break-word; line-height: 1.6; }
      `}</style>

      <ReactMarkdown
        className="toc-content dark:text-neutral-300"
        remarkPlugins={[gfm, remarkMermaid, remarkMath, remarkAlert]}
        children={content}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          p: ({ node, style, ...p }) => <p className="my-2" style={parseInlineStyle(style)} {...p} />,
          span: ({ node, style, ...p }) => <span style={parseInlineStyle(style)} {...p} />,
          div: ({ node, style, ...p }) => <div style={parseInlineStyle(style)} {...p} />,
          img({ node, src, ...p }) {
            const offset = node?.position?.start.offset ?? 0;
            const previousContent = content.slice(0, offset);
            const isBlock = countNewlinesBeforeNode(previousContent, offset) >= 1 || isMarkdownImageLinkAtEnd(previousContent);
            return (
              <span className={isBlock ? "block w-full text-center my-4" : "inline-block align-middle mx-1"}>
                <img src={src} {...p} onClick={() => show(src)} className={`mx-auto ${isBlock ? "rounded-xl" : ""}`} style={{ zoom: isBlock ? "0.75" : "0.5" }} />
              </span>
            );
          },
          code(props) {
            const [copied, setCopied] = React.useState(false);
            const { children, className, node, ...rest } = props;
            const match = /language-(\w+)/.exec(className || "");
            const isCodeBlock = content.slice(node?.position?.start.offset || 0).trimStart().startsWith("```");
            if (isCodeBlock) {
              return (
                <div className="relative group">
                  <SyntaxHighlighter PreTag="div" language={match ? match[1] : ""} style={colorMode === "dark" ? vscDarkPlus : base16AteliersulphurpoolLight} wrapLongLines={true} codeTagProps={{ style: { fontFamily: '"Fira Code", monospace', fontSize: "14px" } }}>
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                  <button className="absolute top-1 right-1 px-2 py-1 bg-w rounded-md text-sm bg-hover invisible group-hover:visible" onClick={() => { navigator.clipboard.writeText(String(children)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              );
            }
            return <code {...rest} className="bg-[#eff1f3] dark:bg-[#4a5061] px-[4px] rounded-md" style={{fontFamily: '"Fira Code", monospace', fontSize: "13px"}}>{children}</code>;
          }
        }}
      />
    </div>
  ), [content, colorMode]);

  return (
    <>
      {Content}
      <Lightbox plugins={[Zoom, Counter]} index={index} slides={slides.current} open={index >= 0} close={() => setIndex(-1)} zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }} />
    </>
  );
}
