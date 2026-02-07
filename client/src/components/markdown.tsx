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

// --- 核心补丁：将 HTML Style 字符串转换为 React 对象 ---
const parseInlineStyle = (style: any): React.CSSProperties => {
  if (typeof style !== 'string') return style || {};
  const styleObj: any = {};
  style.split(';').forEach(rule => {
    const [key, value] = rule.split(':');
    if (key && value) {
      const camelKey = key.trim().replace(/-([a-z])/g, g => g[1].toUpperCase());
      styleObj[camelKey] = value.trim().replace(/&quot;/g, '"');
    }
  });
  return styleObj;
};

export function Markdown({ content }: { content: string }) {
  const colorMode = useColorMode();
  const [index, setIndex] = React.useState(-1);
  const slides = useRef<SlideImage[]>();

  useEffect(() => {
    slides.current = undefined;
  }, [content]);

  const show = (src: string | undefined) => {
    let slidesLocal = slides.current;
    if (!slidesLocal) {
      const parent = document.getElementsByClassName("toc-content")[0];
      if (!parent) return;
      const images = parent.querySelectorAll("img");
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
    <div className="markdown-render-wrapper">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;700&family=Zhi+Mang+Xing&display=swap');
        
        .toc-content {
          white-space: pre-wrap !important;
          word-break: break-word;
        }

        /* 字体补丁：确保 Google Fonts 优先级最高 */
        [style*="Ma Shan Zheng"] { font-family: 'Ma Shan Zheng', cursive !important; }
        [style*="Zhi Mang Xing"] { font-family: 'Zhi Mang Xing', cursive !important; }
        [style*="Noto Serif SC"] { font-family: 'Noto Serif SC', serif !important; }
      `}</style>

      <ReactMarkdown
        className="toc-content dark:text-neutral-300"
        remarkPlugins={[gfm, remarkMermaid, remarkMath, remarkAlert]}
        children={content}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          // 样式透传核心组件
          p({ children, style, ...props }) {
            return <p style={parseInlineStyle(style)} className="my-2" {...props}>{children}</p>;
          },
          span({ children, style, ...props }) {
            const s = parseInlineStyle(style);
            return (
              <span 
                style={{
                  ...s,
                  display: (s.fontSize || s.lineHeight) ? 'inline-block' : 'inline',
                  maxWidth: '100%'
                }} 
                {...props}
              >
                {children}
              </span>
            );
          },
          div({ children, style, ...props }) {
            return <div style={parseInlineStyle(style)} {...props}>{children}</div>;
          },
          // 图片处理
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
          // 代码高亮
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
          // 其他基础 HTML 标签
          blockquote: ({children, ...props}) => <blockquote className="border-l-4 border-gray-300 pl-4 italic" {...props}>{children}</blockquote>,
          a: ({children, ...props}) => <a className="text-[#0686c8] hover:underline" {...props}>{children}</a>,
          ul: ({children, className, ...props}) => <ul className={className?.includes("contains-task-list") ? "list-none pl-5" : "list-disc pl-5 mt-2"} {...props}>{children}</ul>,
          ol: ({children, ...props}) => <ol className="list-decimal pl-5" {...props}>{children}</ol>,
          h1: ({children, ...props}) => <h1 className="text-3xl font-bold mt-4" {...props}>{children}</h1>,
          h2: ({children, ...props}) => <h2 className="text-2xl font-bold mt-4" {...props}>{children}</h2>,
          h3: ({children, ...props}) => <h3 className="text-xl font-bold mt-4" {...props}>{children}</h3>,
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
