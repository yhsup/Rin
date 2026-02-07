import "katex/dist/katex.min.css";
import React, { cloneElement, isValidElement, useEffect, useMemo, useRef } from "react";
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

// ... countNewlinesBeforeNode 和 isMarkdownImageLinkAtEnd 保持不变 ...

export function Markdown({ content }: { content: string }) {
  const colorMode = useColorMode();
  const [index, setIndex] = React.useState(-1);
  const slides = useRef<SlideImage[]>();

  useEffect(() => {
    slides.current = undefined;
  }, [content]);

  const Content = useMemo(() => (
    <div className="markdown-render-wrapper">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;700&family=Zhi+Mang+Xing&display=swap');
        
        .toc-content {
          white-space: pre-wrap !important;
          word-break: break-word;
        }

        /* 强制让所有带有 style 的元素使用 flex/inline-block 布局，以响应行高 */
        .toc-content [style*="line-height"] {
          display: inline-block;
          width: 100%; /* 针对块级样式的 span */
        }

        /* 确保字体映射 */
        [style*="Ma Shan Zheng"] { font-family: 'Ma Shan Zheng', cursive !important; }
        [style*="Zhi Mang Xing"] { font-family: 'Zhi Mang Xing', cursive !important; }
        [style*="Noto Serif SC"] { font-family: 'Noto Serif SC', serif !important; }
        [style*="Sarasa Mono SC"] { font-family: 'Sarasa Mono SC', monospace !important; }
      `}</style>

      <ReactMarkdown
        className="toc-content dark:text-neutral-300"
        remarkPlugins={[gfm, remarkMermaid, remarkMath, remarkAlert]}
        children={content}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          // 处理 P 标签：它是很多样式的容器
          p({ children, style, ...props }) {
            return (
              <p 
                style={{ ...style, lineHeight: style?.lineHeight || 'inherit' }} 
                className="my-2" 
                {...props}
              >
                {children}
              </p>
            );
          },
          // 处理 Span 标签：它是 Vditor 注入字号和行高的主要载体
          span({ children, style, ...props }) {
            // 显式提取 style 并重新应用到 React 组件上
            return (
              <span 
                style={{ ...style }} 
                {...props}
              >
                {children}
              </span>
            );
          },
          // 处理 Div 标签：防止某些 HTML 块样式丢失
          div({ children, style, ...props }) {
            return (
              <div style={{ ...style }} {...props}>
                {children}
              </div>
            );
          },
          // --- 以下为原有的其他组件逻辑 ---
          img({ node, src, ...props }) {
            const offset = node!.position!.start.offset!;
            const previousContent = content.slice(0, offset);
            const newlinesBefore = countNewlinesBeforeNode(previousContent, offset);
            const Image = ({ rounded, scale }: { rounded: boolean; scale: string; }) => (
              <img src={src} {...props} onClick={() => show(src)}
                className={`mx-auto ${rounded ? "rounded-xl" : ""}`}
                style={{ zoom: scale }}
              />
            );
            if (newlinesBefore >= 1 || previousContent.trim().length === 0 || isMarkdownImageLinkAtEnd(previousContent)) {
              return <span className="block w-full text-center my-4"><Image scale="0.75" rounded={true} /></span>;
            }
            return <span className="inline-block align-middle mx-1 "><Image scale="0.5" rounded={false} /></span>;
          },
          code(props) {
            const [copied, setCopied] = React.useState(false);
            const { children, className, node, ...rest } = props;
            const match = /language-(\w+)/.exec(className || "");
            const curContent = content.slice(node?.position?.start.offset || 0);
            const isCodeBlock = curContent.trimStart().startsWith("```");
            const codeBlockStyle = { fontFamily: '"Fira Code", monospace', fontSize: "14px" };
            const language = match ? match[1] : "";
            if (isCodeBlock) {
              return (
                <div className="relative group">
                  <SyntaxHighlighter PreTag="div" className="rounded" language={language}
                    style={colorMode === "dark" ? vscDarkPlus : base16AteliersulphurpoolLight}
                    wrapLongLines={true} codeTagProps={{ style: codeBlockStyle }}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                  <button className="absolute top-1 right-1 px-2 py-1 bg-w rounded-md text-sm bg-hover invisible group-hover:visible"
                    onClick={() => { navigator.clipboard.writeText(String(children)); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              );
            }
            return <code {...rest} className={`bg-[#eff1f3] dark:bg-[#4a5061] px-[4px] rounded-md ${className || ""}`} style={{...codeBlockStyle, fontSize: "13px"}}>{children}</code>;
          },
          blockquote: ({children, ...props}) => <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-500" {...props}>{children}</blockquote>,
          ul: ({children, className, ...props}) => <ul className={className?.includes("contains-task-list") ? "list-none pl-5" : "list-disc pl-5 mt-2"} {...props}>{children}</ul>,
          ol: ({children, ...props}) => <ol className="list-decimal pl-5" {...props}>{children}</ol>,
          li: ({children, ...props}) => <li className="pl-2 py-1" {...props}>{children}</li>,
          a: ({children, ...props}) => <a className="text-[#0686c8] hover:underline" {...props}>{children}</a>,
          h1: ({children, ...props}) => <h1 id={children?.toString()} className="text-3xl font-bold mt-4" {...props}>{children}</h1>,
          h2: ({children, ...props}) => <h2 id={children?.toString()} className="text-2xl font-bold mt-4" {...props}>{children}</h2>,
          h3: ({children, ...props}) => <h3 id={children?.toString()} className="text-xl font-bold mt-4" {...props}>{children}</h3>,
          table: ({ ...props }) => <table className="table" {...props} />,
          th: ({ ...props }) => <th className="px-4 py-2 border bg-gray-600 text-white" {...props} />,
          td: ({ ...props }) => <td className="px-4 py-2 border" {...props} />,
          sup: ({children, ...props}) => <sup className="text-xs mr-[4px]" {...props}>{children}</sup>,
          sub: ({children, ...props}) => <sub className="text-xs mr-[4px]" {...props}>{children}</sub>,
        }}
      />
    </div>
  ), [content, colorMode]);

  const show = (src: string | undefined) => {
    let slidesLocal = slides.current;
    if (!slidesLocal) {
      const parent = document.getElementsByClassName("toc-content")[0];
      if (!parent) return;
      const images = parent.querySelectorAll("img");
      slidesLocal = Array.from(images).map((image) => ({
        src: image.getAttribute("src") || "",
        alt: image.getAttribute("alt") || "",
        imageFit: "contain" as const,
        download: { url: image.getAttribute("src") || "", filename: (image.getAttribute("src") || "").split("/").pop() || "" },
      })).filter((slide) => slide.src !== "");
      slides.current = slidesLocal;
    }
    const index = slidesLocal?.findIndex((slide) => slide.src === src) ?? -1;
    setIndex(index);
  };

  return (
    <>
      {Content}
      <Lightbox plugins={[Zoom, Counter]} index={index} slides={slides.current} open={index >= 0} close={() => setIndex(-1)} zoom={{ maxZoomPixelRatio: 3, scrollToZoom: true }} />
    </>
  );
}
