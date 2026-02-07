import "katex/dist/katex.min.css";
import React, { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { base16AteliersulphurpoolLight, vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
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
        
        .toc-content { word-break: break-word; line-height: 1.6; }
        .toc-content p { margin: 0.8em 0; white-space: pre-wrap !important; }
        .toc-content table { border-collapse: collapse; width: 100%; margin: 1rem 0; display: table !important; }
        .toc-content th, .toc-content td { border: 1px solid #ddd; padding: 8px; }
        
        /* 样式增强：支持颜色、高亮、局部字体 */
        .toc-content span[style] { display: inline; }
        .toc-content span[style*="background-color"] { padding: 0 4px; border-radius: 3px; }

        [style*="Ma Shan Zheng"] { font-family: 'Ma Shan Zheng', cursive !important; }
        [style*="Zhi Mand Xing"] { font-family: 'Zhi Mang Xing', cursive !important; }
        [style*="Noto Serif SC"] { font-family: 'Noto Serif SC', serif !important; }
      `}</style>

      <ReactMarkdown
        className="toc-content dark:text-neutral-300"
        remarkPlugins={[gfm, remarkMermaid, remarkMath, remarkAlert]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          table: ({ node, ...props }) => <div className="overflow-x-auto"><table {...props} /></div>,
          th: ({ node, ...props }) => <th className="bg-gray-100 dark:bg-zinc-800 border font-bold" {...props} />,
          td: ({ node, ...props }) => <td className="border" {...props} />,
          code({ children, className, node, ...rest }: any) {
            const match = /language-(\w+)/.exec(className || "");
            return match ? (
              <SyntaxHighlighter 
                language={match[1]} 
                style={colorMode === "dark" ? vscDarkPlus : base16AteliersulphurpoolLight} 
                PreTag="div" 
                {...rest}
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            ) : (
              <code className="bg-gray-100 dark:bg-zinc-800 px-1 rounded text-sm" {...rest}>{children}</code>
            );
          }
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
      />
    </>
  );
}
