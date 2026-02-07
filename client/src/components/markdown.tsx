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
        [style*="Zhi Mang Xing"] { font-family: 'Zhi Mang Xing', cursive !important; }
        [style*="Noto Serif SC"] { font-family: 'Noto Serif SC', serif !important; }

        /* 视频容器比例控制 */
        .aspect-video {
          aspect-ratio: 16 / 9;
          width: 100%;
          background: #000;
          border-radius: 0.75rem;
          overflow: hidden;
        }
      `}</style>

      <ReactMarkdown
        className="toc-content dark:text-neutral-300"
        remarkPlugins={[gfm, remarkMermaid, remarkMath, remarkAlert]}
        rehypePlugins={[rehypeKatex, rehypeRaw]}
        components={{
          table: ({ node, ...props }) => <div className="overflow-x-auto"><table {...props} /></div>,
          th: ({ node, ...props }) => <th className="bg-gray-100 dark:bg-zinc-800 border font-bold" {...props} />,
          td: ({ node, ...props }) => <td className="border" {...props} />,
          
          // 核心：视频链接解析逻辑
          a: ({ node, children, href, ...props }: any) => {
            // 1. 原生视频文件 (mp4, webm, ogg)
            if (href?.match(/\.(mp4|webm|ogg)$/i)) {
              return (
                <div className="my-4">
                  <video src={href} controls className="w-full rounded-xl shadow-lg shadow-light">
                    您的浏览器不支持视频播放。
                  </video>
                  <p className="text-[10px] text-center opacity-40 mt-1 italic">{String(children)}</p>
                </div>
              );
            }

            // 2. YouTube
            if (href?.includes('youtube.com/watch') || href?.includes('youtu.be/')) {
              const videoId = href.includes('v=') ? href.split('v=')[1]?.split('&')[0] : href.split('/').pop();
              return (
                <div className="aspect-video my-4 shadow-xl shadow-light">
                  <iframe
                    className="w-full h-full"
                    src={`https://www.youtube.com/embed/${videoId}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  ></iframe>
                </div>
              );
            }

            // 3. Bilibili
            if (href?.includes('bilibili.com/video/')) {
              const bvid = href.split('video/')[1]?.split('/')[0]?.split('?')[0];
              return (
                <div className="aspect-video my-4 shadow-xl shadow-light">
                  <iframe
                    className="w-full h-full"
                    src={`//player.bilibili.com/player.html?bvid=${bvid}&page=1&high_quality=1&danmaku=0`}
                    allowFullScreen
                    scrolling="no"
                  ></iframe>
                </div>
              );
            }

            return <a href={href} {...props} className="text-theme hover:underline">{children}</a>;
          },

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
