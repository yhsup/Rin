import "katex/dist/katex.min.css";
import React, { cloneElement, isValidElement, useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { base16AteliersulphurpoolLight, vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import gfm from "remark-gfm";
import remarkBreaks from "remark-breaks"; 
import remarkMermaid from "../remark/remarkMermaid";
import { remarkAlert } from "remark-github-blockquote-alert";
import remarkMath from "remark-math";
import Lightbox, { SlideImage } from "yet-another-react-lightbox";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import { useColorMode } from "../utils/darkModeUtils";

// --- 工具函数 ---
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
  const match = trimmed.match(/(.*)(!\[.*?\]\(.*?\))$/s);
  if (match) {
    const [, beforeImage] = match;
    return beforeImage.trim().length === 0 || beforeImage.endsWith("\n");
  }
  return false;
};

export function Markdown({ content }: { content: string }) {
  const colorMode = useColorMode();
  const [index, setIndex] = React.useState(-1);
  const slides = useRef<SlideImage[]>();

  useEffect(() => { slides.current = undefined; }, [content]);

  const showLightbox = (src: string | undefined) => {
    if (!slides.current) {
      const parent = document.getElementsByClassName("toc-content")[0];
      if (!parent) return;
      const images = parent.querySelectorAll("img");
      slides.current = Array.from(images)
        .map((image) => ({
          src: image.getAttribute("src") || "",
          alt: image.getAttribute("alt") || "",
          imageFit: "contain" as const,
        }))
        .filter((slide) => slide.src !== "");
    }
    const idx = slides.current?.findIndex((slide) => slide.src === src) ?? -1;
    setIndex(idx);
  };

  const Content = useMemo(() => (
    <div className="markdown-render-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;700&family=Zhi+Mang+Xing&family=Fira+Code:wght@400;500&display=swap');
        .toc-content { word-break: break-word; line-height: 1.7; white-space: normal; }
        .toc-content table br { display: none; }
        .toc-content table { border-collapse: collapse; width: 100%; margin: 1.5rem 0; display: table !important; }
        .toc-content th, .toc-content td { border: 1px solid #ddd; padding: 10px; line-height: 1.5; }
        .toc-content th { background-color: rgba(0,0,0,0.02); }
        .toc-content p { margin-bottom: 1.1rem; }
        .aspect-video { aspect-ratio: 16 / 9; width: 100%; background: #000; border-radius: 0.75rem; overflow: hidden; }
        .code-block-wrapper { font-family: 'Fira Code', monospace; font-variant-ligatures: normal; }
      `}</style>

      <ReactMarkdown
        className="toc-content dark:text-neutral-300"
        remarkPlugins={[gfm, remarkBreaks, remarkMermaid, remarkMath, remarkAlert]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          img({ node, src, ...props }) {
            const offset = node?.position?.start.offset || 0;
            const previousContent = content.slice(0, offset);
            const newlinesBefore = countNewlinesBeforeNode(previousContent, offset);
            const isBlock = newlinesBefore >= 1 || previousContent.trim().length === 0 || isMarkdownImageLinkAtEnd(previousContent);

            return (
              <span className={isBlock ? "block w-full text-center my-4" : "inline-block align-middle mx-1"}>
                <img
                  src={src}
                  {...props}
                  onClick={() => showLightbox(src)}
                  className={`cursor-zoom-in hover:opacity-90 transition-opacity mx-auto ${isBlock ? "rounded-xl shadow-md" : ""}`}
                  style={{ zoom: isBlock ? "0.75" : "0.5" }}
                />
              </span>
            );
          },
          code(props: any) {
            const { children, className, node, ...rest } = props;
            const match = /language-(\w+)/.exec(className || "");
            const [copied, setCopied] = React.useState(false);
            const curContent = content.slice(node?.position?.start.offset || 0);
            const isCodeBlock = curContent.trimStart().startsWith("```") || !!match;

            if (isCodeBlock) {
              return (
                <div className="relative group my-4 code-block-wrapper">
                  <SyntaxHighlighter
                    language={match ? match[1] : ""}
                    style={colorMode === "dark" ? vscDarkPlus : base16AteliersulphurpoolLight}
                    PreTag="div"
                    className="rounded-lg shadow-sm"
                    wrapLongLines={true}
                    {...rest}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                  <button 
                    className="absolute top-2 right-2 px-2 py-1 bg-white/10 hover:bg-white/20 dark:bg-black/20 backdrop-blur-md border border-white/20 rounded-md text-xs transition-all opacity-0 group-hover:opacity-100"
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
            return <code className="bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-[13px] font-mono mx-1" {...rest}>{children}</code>;
          },
          // ... 其他 a, table, section 等逻辑保持不变
          a: ({ node, children, href, ...props }: any) => {
            if (href?.match(/\.(mp4|webm|ogg)$/i)) {
              return (
                <div className="my-4 text-center">
                  <video src={href} controls className="w-full rounded-xl shadow-lg" />
                  <a href={href} target="_blank" rel="noreferrer" className="text-[10px] text-theme opacity-50 mt-1 italic hover:underline block">
                    {String(children) || "查看视频原文件"}
                  </a>
                </div>
              );
            }
            return <a href={href} {...props} className="text-theme hover:underline">{children}</a>;
          },
          table: ({ node, ...props }) => <div className="overflow-x-auto"><table {...props} /></div>,
          th: ({ node, ...props }) => <th className="bg-gray-100 dark:bg-zinc-800 border font-bold" {...props} />,
          td: ({ node, ...props }) => <td className="border" {...props} />,
          section({ children, ...props }) {
            if (props.hasOwnProperty("data-footnotes")) {
              props.className = `${props.className || ""} mt-8 pt-4 border-t dark:border-zinc-800`.trim();
            }
            return <section {...props}>{children}</section>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  ), [content, colorMode]);

  return (
    <>
      {Content}
      <Lightbox 
        slides={slides.current} 
        index={index} 
        open={index >= 0} 
        close={() => setIndex(-1)} 
        plugins={[Zoom, Counter]} 
        // --- 核心修复：添加缩放配置 ---
        zoom={{
          maxZoomPixelRatio: 3,      // 最大放大倍数
          zoomInMultiplier: 2,       // 按钮放大比例
          wheelZoomDistanceFactor: 100, // 鼠标滑轮缩放灵敏度
          scrollToZoom: true         // 开启鼠标滚轮缩放
        }}
      />
    </>
  );
}
