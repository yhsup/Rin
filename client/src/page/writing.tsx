import { useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useAlert } from '../components/dialog';
import { Input } from "../components/input";
import { Cache } from '../utils/cache';
import { MarkdownEditor } from '../components/markdown_editor';

export function WritingPage({ id }: { id?: number }) {
  const { t } = useTranslation();
  const cache = Cache.with(id);
  const [title, setTitle] = cache.useCache("title", "");
  const [content, setContent] = cache.useCache("content", "");
  const { AlertUI } = useAlert();

  // 字体状态
  const [fontSize, setFontSize] = useState(localStorage.getItem('rin-fontSize') || '16px');
  const [fontFamily, setFontFamily] = useState(localStorage.getItem('rin-fontFamily') || 'Sarasa Mono SC, sans-serif');
  const [lineHeight, setLineHeight] = useState(Number(localStorage.getItem('rin-lineHeight')) || 1.6);

  const numericFontSize = parseInt(fontSize);
  const actualLineHeight = Math.round(numericFontSize * lineHeight);

  return (
    <>
      <Helmet>
        <title>写作 - Rin</title>
        {/* 关键：引入用于局部字体的 Google Fonts */}
        <link href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;700&family=Zhi+Mang+Xing&display=swap" rel="stylesheet" />
        <style>
          {`
            .vditor-reset, .markdown-content {
              font-size: ${fontSize} !important;
              line-height: ${lineHeight} !important;
              font-family: ${fontFamily} !important;
            }
            /* 确保预览区内联样式生效 */
            .vditor-reset u { text-decoration: underline; }
            .vditor-reset sup { vertical-align: super; font-size: 0.8em; }
            .vditor-reset sub { vertical-align: sub; font-size: 0.8em; }
            /* 清除编辑器光标偏移补丁，现在靠数值计算解决 */
            .monaco-editor .view-line { transform: none !important; }
          `}
        </style>
      </Helmet>

      <div className="p-4 max-w-6xl mx-auto">
        <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-6">
          {/* 顶部全局排版控制 */}
          <div className="flex gap-4 mb-4 text-xs bg-gray-100 dark:bg-zinc-800 p-2 rounded-lg">
            <span>字号: 
              <select value={fontSize} onChange={e => setFontSize(e.target.value)} className="bg-transparent text-theme">
                {['14px', '16px', '18px', '20px'].map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </span>
            <span>字体: 
              <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} className="bg-transparent text-theme">
                <option value="Sarasa Mono SC">更纱等宽</option>
                <option value="Noto Serif SC">思源宋体</option>
              </select>
            </span>
          </div>

          <Input id={id} value={title} setValue={setTitle} placeholder="文章标题" className="mb-4 text-2xl font-bold" />
          
          <MarkdownEditor 
            key={`${fontSize}-${lineHeight}`} // 改变时强制重新加载编辑器
            content={content} 
            setContent={setContent} 
            height="600px"
            fontSize={numericFontSize}
            lineHeight={actualLineHeight}
            fontFamily={fontFamily}
          />
        </div>
      </div>
      <AlertUI />
    </>
  );
}
