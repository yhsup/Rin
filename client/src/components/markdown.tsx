import "katex/dist/katex.min.css";
import React, { useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { base16AteliersulphurpoolLight, vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import gfm from "remark-gfm";
import remarkBreaks from "remark-breaks"; // 1. 引入插件
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

  useEffect(() => { slides.current = undefined; }, [content]);

  const Content = useMemo(() => (
    <div className="markdown-render-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;700&family=Zhi+Mang+Xing&display=swap');
        /* 核心修改：white-space: pre-wrap 确保换行符被渲染，line-height 稍微调大提升阅读感 */
        .toc-content { 
          word-break: break-word; 
          line-height: 1.7; 
          white-space: pre-wrap; 
        }
        .toc-content table { border-collapse: collapse; width: 100%; margin: 1rem 0; display: table !important; }
        .toc-content th, .toc-content td { border: 1px solid #ddd; padding: 8px; }
        .aspect-video { aspect-ratio: 16 / 9; width: 100%; background: #000; border-radius: 0.75rem; overflow: hidden; }
        /* 确保段落之间有自然的间距 */
        .toc-content p { margin-bottom: 0.5rem; }
      `}</style>

      <ReactMarkdown
        className="toc-content dark:text-neutral-300"
        // 2. 将 remarkBreaks 放入插件列表
        remarkPlugins={[gfm, remarkBreaks, remarkMermaid, remarkMath, remarkAlert]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          table: ({ node, ...props }) => <div className="overflow-x-auto"><table {...props} /></div>,
          th: ({ node, ...props }) => <th className="bg-gray-100 dark:bg-zinc-800 border font-bold" {...props} />,
          td: ({ node, ...props }) => <td className="border" {...props} />,
          
          a: ({ node, children, href, ...props }: any) => {
            // 1. 原生视频链接
            if (href?.match(/\.(mp4|webm|ogg)$/i)) {
              return (
                <div className="my-4 text-center">
                  <video src={href} controls className="w-full rounded-xl shadow-lg" />
                  <a href={href} target="_blank" rel="noreferrer" className="text-[10px] text-theme opacity-50 mt-1 italic hover:underline">
                    {String(children) || "查看视频原文件"}
                  </a>
                </div>
              );
            }

            // 2. YouTube 嵌入
            if (href?.includes('youtube.com/watch') || href?.includes('youtu.be/')) {
              const videoId = href.includes('v=') ? href.split('v=')[1]?.split('&')[0] : href.split('/').pop();
              return (
                <div className="my-4">
                  <div className="aspect-video shadow-xl">
                    <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${videoId}`} allowFullScreen></iframe>
                  </div>
                  <a href={href} target="_blank" rel="noreferrer" className="text-[10px] block text-center mt-2 text-theme opacity-60 hover:underline">
                    在 YouTube 中打开
                  </a>
                </div>
              );
            }

            // 3. Bilibili 嵌入
            if (href?.includes('bilibili.com/video/')) {
              const bvid = href.split('video/')[1]?.split('/')[0]?.split('?')[0];
              const biliSrc = `//player.bilibili.com/player.html?bvid=${bvid}&page=1&danmaku=0`;
              return (
                <div className="my-4">
                  <div className="aspect-video shadow-xl">
                    <iframe 
                      className="w-full h-full border-none"
                      src={biliSrc} 
                      allowFullScreen 
                    ></iframe>
                  </div>
                  <a 
                    href={href} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="text-[11px] block text-center mt-2 text-theme opacity-80 font-medium hover:underline"
                  >
                    <i className="ri-bilibili-line mr-1"></i>
                    前往 Bilibili 观看高清原片 ({String(children)})
                  </a>
                </div>
              );
            }

            return <a href={href} {...props} className="text-theme hover:underline">{children}</a>;
          },

          code({ children, className, node, ...rest }: any) {
            const match = /language-(\w+)/.exec(className || "");
            return match ? (
              <SyntaxHighlighter language={match[1]} style={colorMode === "dark" ? vscDarkPlus : base16AteliersulphurpoolLight} PreTag="div" {...rest}>
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
      <Lightbox slides={slides.current} index={index} open={index >= 0} close={() => setIndex(-1)} plugins={[Zoom, Counter]} />
    </>
  );
}
