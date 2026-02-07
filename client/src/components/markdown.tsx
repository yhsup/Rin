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

// --- 工具函数：计算节点前的换行符数量 ---
const countNewlinesBeforeNode = (text: string, offset: number) => {
  let newlinesBefore = 0;
  for (let i = offset - 1; i >= 0; i--) {
    if (text[i] === "\n") {
      newlinesBefore++;
    } else {
      break;
    }
  }
  return newlinesBefore;
};

// --- 工具函数：判断是否是行末的图片链接 ---
const isMarkdownImageLinkAtEnd = (text: string) => {
  const trimmed = text.trim();
  const match = trimmed.match(/(.*)(!\\[.*?\\]\\(.*?\\))$/s);
  if (match) {
    const [, beforeImage] = match;
    return beforeImage.trim().length === 0 || beforeImage.endsWith("\n");
  }
  return false;
};

// --- 样式解析补丁：确保 React 能识别字符串样式 ---
const parseInlineStyle = (style: any): React.CSSProperties => {
  if (typeof style !== 'string') return style || {};
  const styleObj: any = {};
  style.split(';').forEach(rule => {
    const [key, value] = rule.split(':');
    if (key && value) {
      const camelKey = key.trim().replace(/-([a-z])/g, g => g[1].toUpperCase());
      let finalValue = value.trim().replace(/&quot;/g, '"').replace(/"/g, '');
      
      // 字体映射
      if (camelKey === 'fontFamily') {
        if (finalValue.includes('Zhi Mang Xing')) finalValue = "'Zhi Mang Xing', cursive";
        else if (finalValue.includes('Ma Shan Zheng')) finalValue = "'Ma Shan Zheng', cursive";
        else if (finalValue.includes('Noto Serif SC')) finalValue = "'Noto Serif SC', serif";
        else finalValue = `"${finalValue}"`;
      }
      styleObj[camelKey] = finalValue;
    }
  });

  // 强制 inline-block 否则行高和字号在 span 上无效
  if (styleObj.fontSize || styleObj.lineHeight || styleObj.fontFamily) {
    styleObj.display = 'inline-block';
    styleObj.maxWidth = '100%';
    styleObj.verticalAlign = 'baseline';
  }
  return styleObj;
};

export function Markdown({ content }: { content: string }) {
  const colorMode = useColorMode();
  const [index, setIndex] = React.useState(-1);
  const slides = useRef<SlideImage[]>();
  const containerRef = useRef<HTMLDivElement>(null);

  // --- 核心：DOM 暴力监听修正逻辑 ---
  useEffect(() => {
    const fixStyles = () => {
      if (!containerRef.current) return;
      const elements = containerRef.current.querySelectorAll('.toc-content [style]');
      elements.forEach((el) => {
        const target = el as HTMLElement;
        const rawStyle = target.getAttribute('style') || '';
        
        // 如果包含字体，直接通过 JS 赋予最高优先级样式
        if (rawStyle.includes('Zhi Mang Xing')) target.style.fontFamily = "'Zhi Mang Xing', cursive";
        if (rawStyle.includes('Noto Serif SC')) target.style.fontFamily = "'Noto Serif SC', serif";
        if (rawStyle.includes('Ma Shan Zheng')) target.style.fontFamily = "'Ma Shan Zheng', cursive";
        
        // 强制布局
        if (rawStyle.includes('font-size') || rawStyle.includes('line-height') || rawStyle.includes('font-family')) {
          target.style.display = 'inline-block';
          target.style.maxWidth = '100%';
        }
      });
    };

    fixStyles();
    // 监听动态加载的内容
    const observer = new MutationObserver(fixStyles);
    if (containerRef.current) {
      observer.observe(containerRef.current, { childList: true, subtree: true });
    }
    return () => observer.disconnect();
  }, [content]);

  const show = (src: string | undefined) => {
    let slidesLocal = slides.current;
    if (!slidesLocal) {
      if (!containerRef.current) return;
      const images = containerRef.current.querySelectorAll("img");
      slidesLocal = Array.from(images).map((image) => {
        const url = image.getAttribute("src") || "";
        return {
          src: url,
          alt: image.getAttribute("alt") || "",
          imageFit: "contain" as const,
          download: { url, filename: url.split("/").pop() || "image" },
        };
      }).filter((slide) => slide.src !== "");
      slides.current = slidesLocal;
    }
    const idx = slidesLocal?.findIndex((slide) => slide.src === src) ?? -1;
    setIndex(idx);
  };

  const Content = useMemo(() => (
    <div ref={containerRef} className="markdown-render-wrapper">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;700&family=Zhi+Mang+Xing&display=swap');
        
        .toc-content {
          white-space: pre-wrap !important;
          word-break: break-word;
          line-height: 1.6;
        }

        /* 强制覆盖内联 display: inline */
        .toc-content span[style] {
          display: inline-block !important;
          max-width: 100%;
          text-indent: 0;
        }
      `}</style>

      <ReactMarkdown
        className="toc-content dark:text-neutral-300"
        remarkPlugins={[gfm, remarkMermaid, remarkMath, remarkAlert]}
        children={content}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          p: ({ node, style, ...props }) => <p className="my-2" style={parseInlineStyle(style)} {...props} />,
          span: ({ node, style, ...props }) => <span style={parseInlineStyle(style)} {...props} />,
          div: ({ node, style, ...props }) => <div style={parseInlineStyle(style)} {...props} />,
          img({ node, src, ...props }) {
            const offset = node?.position?.start.offset ?? 0;
            const previousContent = content.slice(0, offset);
            const newlinesBefore = countNewlinesBeforeNode(previousContent, offset);
            const isBlock = newlinesBefore >= 1 || previousContent.trim().length === 0 || isMarkdownImageLinkAtEnd(previousContent);

            return (
              <span className={isBlock ? "block w-full text-center my-4" : "inline-block align-middle mx-1"}>
                <img 
                  src={src} 
                  {...props} 
                  onClick={() => show(src)}
                  className={`mx-auto ${isBlock ? "rounded-xl" : ""}`}
                  style={{ zoom: isBlock ? "0.75" : "0.5" }}
                />
              </span>
            );
          },
          code(props) {
            const [copied, setCopied] = React.useState(false);
            const { children, className, node, ...rest } = props;
            const match = /language-(\w+)/.exec(className || "");
            const isCodeBlock = content.slice(node?.position?.start.offset || 0).trimStart().startsWith("```");
            const codeStyle = { fontFamily: '"Fira Code", monospace', fontSize: "14px" };

            if (isCodeBlock) {
              return (
                <div className="relative group">
                  <SyntaxHighlighter 
                    PreTag="div" 
                    language={match ? match[1] : ""}
                    style={colorMode === "dark" ? vscDarkPlus : base16AteliersulphurpoolLight}
                    wrapLongLines={true} 
                    codeTagProps={{ style: codeStyle }}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                  <button 
                    className="absolute top-1 right-1 px-2 py-1 bg-w rounded-md text-sm bg-hover invisible group-hover:visible"
                    onClick={() => {
                      navigator.clipboard.writeText(String(children));
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              );
            }
            return <code {...rest} className={`bg-[#eff1f3] dark:bg-[#4a5061] px-[4px] rounded-md`} style={{...codeStyle, fontSize: "13px"}}>{children}</code>;
          },
          blockquote: ({children, ...props}) => <blockquote className="border-l-4 border-gray-300 pl-4 italic" {...props}>{children}</blockquote>,
          a: ({children, ...props}) => <a className="text-[#0686c8] hover:underline" {...props}>{children}</a>,
        }}
      />
    </div>
  ), [content, colorMode]);

  return (
    <>
      {Content}
      <Lightbox 
        plugins={[Zoom, Counter]} 
        index={index} 
        slides={slides.current} 
        open={index >= 0} 
        close={() => setIndex(-1)} 
        zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }} 
      />
    </>
  );
}
