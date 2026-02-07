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
    if (text[i] === "\n") newlinesBefore++;
    else break;
  }
  return newlinesBefore;
};

// --- 工具函数：判断是否是行末的图片链接 ---
const isMarkdownImageLinkAtEnd = (text: string) => {
  const trimmed = text.trim();
  const match = trimmed.match(/(.*)(!\\[.*?\\]\\(.*?\\))$/s);
  return match ? (match[1].trim().length === 0 || match[1].endsWith("\n")) : false;
};

// --- 核心逻辑：将 Style 转换为全局 Class ---
const getClassNameFromStyle = (style: any): string => {
  if (typeof style !== 'string') return "";
  const styles = style.toLowerCase();
  let classes = [];
  
  if (styles.includes('zhi mang xing')) classes.push('font-zhi-mang');
  if (styles.includes('noto serif sc')) classes.push('font-noto-serif');
  if (styles.includes('ma shan zheng')) classes.push('font-ma-shan');
  
  return classes.join(' ');
};

export function Markdown({ content }: { content: string }) {
  const colorMode = useColorMode();
  const [index, setIndex] = React.useState(-1);
  const slides = useRef<SlideImage[]>();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    slides.current = undefined;
  }, [content]);

  const show = (src: string | undefined) => {
    let slidesLocal = slides.current;
    if (!slidesLocal) {
      if (!containerRef.current) return;
      const images = containerRef.current.querySelectorAll("img");
      slidesLocal = Array.from(images).map((image) => ({
        src: image.getAttribute("src") || "",
        alt: image.getAttribute("alt") || "",
        imageFit: "contain" as const,
        download: { 
          url: image.getAttribute("src") || "", 
          filename: (image.getAttribute("src") || "").split("/").pop() || "image" 
        },
      })).filter((slide) => slide.src !== "");
      slides.current = slidesLocal;
    }
    const idx = slidesLocal?.findIndex((slide) => slide.src === src) ?? -1;
    setIndex(idx);
  };

  const Content = useMemo(() => (
    <div ref={containerRef} className="markdown-render-wrapper">
      <ReactMarkdown
        className="toc-content dark:text-neutral-300"
        remarkPlugins={[gfm, remarkMermaid, remarkMath, remarkAlert]}
        children={content}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          // 这里的关键是：识别 style 并将其转为我们 index.css 中定义的 class
          span: ({ node, style, className, ...props }) => {
            const fontClass = getClassNameFromStyle(style);
            return <span className={`${className || ''} ${fontClass}`.trim()} {...props} />;
          },
          p: ({ node, ...props }) => <p className="my-2" {...props} />,
          div: ({ node, ...props }) => <div {...props} />,
          img({ node, src, ...props }) {
            const offset = node?.position?.start.offset ?? 0;
            const previousContent = content.slice(0, offset);
            const isBlock = countNewlinesBeforeNode(previousContent, offset) >= 1 || isMarkdownImageLinkAtEnd(previousContent);
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
            if (isCodeBlock) {
              return (
                <div className="relative group">
                  <SyntaxHighlighter 
                    PreTag="div" 
                    language={match ? match[1] : ""}
                    style={colorMode === "dark" ? vscDarkPlus : base16AteliersulphurpoolLight}
                    wrapLongLines={true} 
                    codeTagProps={{ style: { fontFamily: '"Fira Code", monospace', fontSize: "14px" } }}
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
            return <code {...rest} className="bg-[#eff1f3] dark:bg-[#4a5061] px-[4px] rounded-md" style={{fontFamily: '"Fira Code", monospace', fontSize: "13px"}}>{children}</code>;
          }
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
