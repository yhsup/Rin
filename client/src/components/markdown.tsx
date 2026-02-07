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

const isMarkdownImageLinkAtEnd = (text: string) => {
  const trimmed = text.trim();
  const match = trimmed.match(/(.*)(!\[.*?\]\(.*?\))$/s);
  if (match) {
    const [, beforeImage, _] = match;
    return beforeImage.trim().length === 0 || beforeImage.endsWith("\n");
  }
  return false;
};

export function Markdown({ content }: { content: string }) {
  const colorMode = useColorMode();
  const [index, setIndex] = React.useState(-1);
  const slides = useRef<SlideImage[]>();

  useEffect(() => {
    slides.current = undefined;
  }, [content]);

  const Content = useMemo(() => (
    <div className="markdown-render-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;700&family=Zhi+Mang+Xing&display=swap');
        
        /* 核心修复：容器不再强制全局 pre-wrap */
        .toc-content {
          word-break: break-word;
          line-height: 1.6;
          white-space: normal !important; 
        }

        /* 仅对段落应用 pre-wrap，保留用户的手动换行感 */
        .toc-content p {
          white-space: pre-wrap !important;
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
        }

        /* 表格区域彻底禁用 pre-wrap，消除幽灵空行 */
        .toc-content table {
          white-space: normal !important;
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
          display: table !important;
        }

        .toc-content span[style] {
          display: inline-block; 
        }

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
          img({ node, src, ...props }) {
            const offset = node!.position!.start.offset!;
            const previousContent = content.slice(0, offset);
            const newlinesBefore = countNewlinesBeforeNode(previousContent, offset);
            const Image = ({ rounded, scale }: { rounded: boolean; scale: string; }) => (
              <img
                src={src}
                {...props}
                onClick={() => show(src)}
                className={`mx-auto ${rounded ? "rounded-xl" : ""}`}
                style={{ zoom: scale }}
              />
            );
            if (newlinesBefore >= 1 || previousContent.trim().length === 0 || isMarkdownImageLinkAtEnd(previousContent)) {
              return (
                <span className="block w-full text-center my-4">
                  <Image scale="0.75" rounded={true} />
                </span>
              );
            } else {
              return (
                <span className="inline-block align-middle mx-1 ">
                  <Image scale="0.5" rounded={false} />
                </span>
              );
            }
          },
          code(props) {
            const [copied, setCopied] = React.useState(false);
            const { children, className, node, ...rest } = props;
            const match = /language-(\w+)/.exec(className || "");
            const curContent = content.slice(node?.position?.start.offset || 0);
            const isCodeBlock = curContent.trimStart().startsWith("```");

            const codeBlockStyle = {
              fontFamily: '"Fira Code", monospace',
              fontSize: "14px",
              fontVariantLigatures: "normal",
            };

            const language = match ? match[1] : "";

            if (isCodeBlock) {
              return (
                <div className="relative group">
                  <SyntaxHighlighter
                    PreTag="div"
                    className="rounded"
                    language={language}
                    style={colorMode === "dark" ? vscDarkPlus : base16AteliersulphurpoolLight}
                    wrapLongLines={true}
                    codeTagProps={{ style: codeBlockStyle }}
                  >
                    {String(children).replace(/\n$/, "")}
                  </SyntaxHighlighter>
                  <button className="absolute top-1 right-1 px-2 py-1 bg-w rounded-md text-sm bg-hover select-none invisible group-hover:visible"
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
            } else {
              return (
                <code
                  {...rest}
                  className={`bg-[#eff1f3] dark:bg-[#4a5061] h-[24px] px-[4px] rounded-md mx-[2px] py-[2px] text-neutral-800 dark:text-neutral-300 ${className || ""}`}
                  style={{ ...codeBlockStyle, fontSize: "13px" }}
                >
                  {children}
                </code>
              );
            }
          },
          // --- 修复表格 node="[object Object]" 问题 ---
          table: ({ node, ...props }) => <table className="table" {...props} />,
          th: ({ node, ...props }) => (
            <th className="px-4 py-2 border bg-gray-600 font-bold text-white" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="px-4 py-2 border" {...props} />
          ),
          p({ children, ...props }) {
            return (
              <p className="mt-2 py-1 leading-relaxed" {...props}>
                {children}
              </p>
            );
          },
          blockquote({ children, ...props }) {
            return (
              <blockquote className="border-l-4 border-gray-300 dark:border-gray-500 pl-4 italic text-gray-500 dark:text-gray-400" {...props}>
                {children}
              </blockquote>
            );
          },
          em({ children, ...props }) {
            return <em className="ml-[1px] mr-[4px]" {...props}>{children}</em>;
          },
          strong({ children, ...props }) {
            return <strong className="mx-[1px]" {...props}>{children}</strong>;
          },
          ul({ children, className, ...props }) {
            const listClass = className?.includes("contains-task-list") ? "list-none pl-5" : "list-disc pl-5 mt-2";
            return <ul className={listClass} {...props}>{children}</ul>;
          },
          ol({ children, ...props }) {
            return <ol className="list-decimal pl-5" {...props}>{children}</ol>;
          },
          li({ children, ...props }) {
            return <li className="pl-2 py-1" {...props}>{children}</li>;
          },
          a({ children, ...props }) {
            return <a className="text-[#0686c8] dark:text-[#2590f1] hover:underline" {...props}>{children}</a>;
          },
          h1: ({ node, ...props }) => <h1 className="text-3xl font-bold mt-4" {...props} />,
          h2: ({ node, ...props }) => <h2 className="text-2xl font-bold mt-4" {...props} />,
          h3: ({ node, ...props }) => <h3 className="text-xl font-bold mt-4" {...props} />,
          h4: ({ node, ...props }) => <h4 className="text-lg font-bold mt-4" {...props} />,
          h5: ({ node, ...props }) => <h5 className="text-base font-bold mt-4" {...props} />,
          h6: ({ node, ...props }) => <h6 className="text-sm font-bold mt-4" {...props} />,
          hr: ({ node, ...props }) => <hr className="my-4" {...props} />,
          sup: ({ node, children, ...props }) => <sup className="text-xs mr-[4px]" {...props}>{children}</sup>,
          sub: ({ node, children, ...props }) => <sub className="text-xs mr-[4px]" {...props}>{children}</sub>,
          section({ node, children, ...props }) {
            if (props.hasOwnProperty("data-footnotes")) {
              props.className = `${props.className || ""} mt-8`.trim();
            }
            return <section {...props}>{children}</section>;
          },
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
      slidesLocal = Array.from(images)
        .map((image) => {
          const url = image.getAttribute("src") || "";
          const filename = url.split("/").pop() || "";
          const alt = image.getAttribute("alt") || "";
          return {
            src: url,
            alt: alt,
            imageFit: "contain" as const,
            download: { url: url, filename: filename },
          };
        })
        .filter((slide) => slide.src !== "");
      slides.current = (slidesLocal);
    }
    const index = slidesLocal?.findIndex((slide) => slide.src === src) ?? -1;
    setIndex(index);
  };

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
