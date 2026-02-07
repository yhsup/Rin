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

  useEffect(() => { slides.current = undefined; }, [content]);

  const Content = useMemo(() => (
    <div className="markdown-render-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;700&family=Zhi+Mang+Xing&display=swap');
        .toc-content { word-break: break-word; line-height: 1.6; }
        .toc-content table { border-collapse: collapse; width: 100%; margin: 1rem 0; display: table !important; }
        .toc-content th, .toc-content td { border: 1px solid #ddd; padding: 8px; }
        .aspect-video { aspect-ratio: 16 / 9; width: 100%; background: #000; border-radius: 0.75rem; overflow: hidden; }
        
        /* 针对 B 站嵌入的黑边和画质提示优化 */
        .bili-iframe { border: none; width: 100%; height: 100%; }
      `}</style>

      <ReactMarkdown
        className="toc-content dark:text-neutral-300"
        remarkPlugins={[gfm, remarkMermaid, remarkMath, remarkAlert]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          table: ({ node, ...props }) => <div className="overflow-x-auto"><table {...props} /></div>,
          th: ({ node, ...props }) => <th className="bg-gray-100 dark:bg-zinc-800 border font-bold" {...props} />,
          td: ({ node, ...props }) => <td className="border" {...props} />,
          
          a: ({ node, children, href, ...props }: any) => {
            // 1. 原生视频
            if (href?.match(/\.(mp4|webm|ogg)$/i)) {
              return (
                <div className="my-4">
                  <video src={href} controls className="w-full rounded-xl shadow-lg" />
                  <p className="text-[10px] text-center opacity-40 mt-1 italic">{String(children)}</p>
                </div>
              );
            }

            // 2. YouTube
            if (href?.includes('youtube.com/watch') || href?.includes('youtu.be/')) {
              const videoId = href.includes('v=') ? href.split('v=')[1]?.split('&')[0] : href.split('/').pop();
              return (
                <div className="aspect-video my-4 shadow-xl">
                  <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${videoId}`} allowFullScreen></iframe>
                </div>
              );
            }

            // 3. Bilibili (高清优化版)
            if (href?.includes('bilibili.com/video/')) {
              const bvid = href.split('video/')[1]?.split('/')[0]?.split('?')[0];
              // 自动加上 high_quality=1 强制高清，as_wide=1 宽屏
              const biliSrc = `//player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&as_wide=1&danmaku=0&autoplay=0`;
              return (
                <div className="my-4">
                  <div className="aspect-video shadow-xl">
                    <iframe 
                      className="bili-iframe"
                      src={biliSrc} 
                      allowFullScreen 
                      sandbox="allow-top-navigation allow-same-origin allow-forms allow-scripts"
                    ></iframe>
                  </div>
                  {/* 提供直达 B 站的链接方便全屏交互 */}
                  <a href={href} target="_blank" rel="noreferrer" className="text-[10px] block text-center mt-2 text-theme opacity-60">
                    在 B 站观看更清晰 (视频源: {bvid})
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
