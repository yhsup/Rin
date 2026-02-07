import i18n from 'i18next';
import _ from 'lodash';
import {Calendar} from 'primereact/calendar';
import 'primereact/resources/primereact.css';
import 'primereact/resources/themes/lara-light-indigo/theme.css';
import {useCallback, useEffect, useState} from "react";
import {Helmet} from "react-helmet";
import {useTranslation} from "react-i18next";
import Loading from 'react-loading';
import {ShowAlertType, useAlert} from '../components/dialog';
import {Checkbox, Input} from "../components/input";
import {client} from "../main";
import {headersWithAuth} from "../utils/auth";
import {Cache} from '../utils/cache';
import {siteName} from "../utils/constants";
import mermaid from 'mermaid';
import { MarkdownEditor } from '../components/markdown_editor';

async function publish({ title, alias, listed, content, summary, tags, draft, createdAt, onCompleted, showAlert }: { title: string; listed: boolean; content: string; summary: string; tags: string[]; draft: boolean; alias?: string; createdAt?: Date; onCompleted?: () => void; showAlert: ShowAlertType; }) {
  const t = i18n.t;
  const { data, error } = await client.feed.index.post({ title, alias, content, summary, tags, listed, draft, createdAt }, { headers: headersWithAuth() });
  if (onCompleted) onCompleted();
  if (error) showAlert(error.value as string);
  if (data && typeof data !== "string") {
    showAlert(t("publish.success"), () => {
      Cache.with().clear();
      window.location.href = "/feed/" + data.insertedId;
    });
  }
}

async function update({ id, title, alias, content, summary, tags, listed, draft, createdAt, onCompleted, showAlert }: { id: number; listed: boolean; title?: string; alias?: string; content?: string; summary?: string; tags?: string[]; draft?: boolean; createdAt?: Date; onCompleted?: () => void; showAlert: ShowAlertType; }) {
  const t = i18n.t;
  const { error } = await client.feed({ id }).post({ title, alias, content, summary, tags, listed, draft, createdAt }, { headers: headersWithAuth() });
  if (onCompleted) onCompleted();
  if (error) showAlert(error.value as string);
  else showAlert(t("update.success"), () => {
    Cache.with(id).clear();
    window.location.href = "/feed/" + id;
  });
}

export function WritingPage({ id }: { id?: number }) {
  const { t } = useTranslation();
  const cache = Cache.with(id);
  const [title, setTitle] = cache.useCache("title", "");
  const [summary, setSummary] = cache.useCache("summary", "");
  const [tags, setTags] = cache.useCache("tags", "");
  const [alias, setAlias] = cache.useCache("alias", "");
  const [draft, setDraft] = useState(false);
  const [listed, setListed] = useState(true);
  const [content, setContent] = cache.useCache("content", "");
  const [createdAt, setCreatedAt] = useState<Date | undefined>(new Date());
  const [publishing, setPublishing] = useState(false);
  const { showAlert, AlertUI } = useAlert();

  const [fontSize, setFontSize] = useState(localStorage.getItem('rin-fontSize') || '16px');
  const [fontFamily, setFontFamily] = useState(localStorage.getItem('rin-fontFamily') || 'Sarasa Mono SC, JetBrains Mono, monospace');
  const [lineHeight, setLineHeight] = useState(Number(localStorage.getItem('rin-lineHeight')) || 1.6);

  // --- 核心计算：将字符串和倍数转换为 Monaco 需要的数值 ---
  const numericFontSize = parseInt(fontSize.replace('px', ''));
  const actualLineHeight = Math.round(numericFontSize * lineHeight);

  function publishButton() {
    if (publishing) return;
    const tagsplit = tags.split("#").filter((tag) => tag !== "").map((tag) => tag.trim()) || [];
    const payload = { title, content, summary, tags: tagsplit, draft, alias, listed, createdAt, onCompleted: () => setPublishing(false), showAlert };
    setPublishing(true);
    if (id !== undefined) update({ id, ...payload });
    else {
      if (!title) { showAlert(t("title_empty")); setPublishing(false); return; }
      if (!content) { showAlert(t("content.empty")); setPublishing(false); return; }
      publish(payload);
    }
  }

  useEffect(() => {
    if (id) {
      client.feed({ id }).get({ headers: headersWithAuth() }).then(({ data }) => {
        if (data && typeof data !== "string") {
          if (title === "" && data.title) setTitle(data.title);
          if (tags === "" && data.hashtags) setTags(data.hashtags.map(({ name }) => `#${name}`).join(" "));
          if (alias === "" && data.alias) setAlias(data.alias);
          if (content === "") setContent(data.content);
          if (summary === "") setSummary(data.summary);
          setListed(data.listed === 1);
          setDraft(data.draft === 1);
          setCreatedAt(new Date(data.createdAt));
        }
      });
    }
  }, [id]);

  const debouncedUpdate = useCallback(
    _.debounce(() => {
      mermaid.initialize({ startOnLoad: false, theme: "default" });
      mermaid.run({ suppressErrors: true, nodes: document.querySelectorAll("pre.mermaid_default") }).then(() => {
        mermaid.initialize({ startOnLoad: false, theme: "dark" });
        mermaid.run({ suppressErrors: true, nodes: document.querySelectorAll("pre.mermaid_dark") });
      });
    }, 100),
    []
  );

  useEffect(() => { debouncedUpdate(); }, [content, debouncedUpdate]);

  function MetaInput({ className }: { className?: string }) {
    return (
      <div className={className}>
        <Input id={id} value={title} setValue={setTitle} placeholder={t("title")} />
        <Input id={id} value={summary} setValue={setSummary} placeholder={t("summary")} className="mt-4" />
        <Input id={id} value={tags} setValue={setTags} placeholder={t("tags")} className="mt-4" />
        <Input id={id} value={alias} setValue={setAlias} placeholder={t("alias")} className="mt-4" />
        <div className="select-none flex flex-row justify-between items-center mt-6 mb-2 px-4 cursor-pointer" onClick={() => setDraft(!draft)}>
          <p>{t('visible.self_only')}</p>
          <Checkbox id="draft" value={draft} setValue={setDraft} placeholder={t('draft')} />
        </div>
        <div className="select-none flex flex-row justify-between items-center mt-6 mb-2 px-4 cursor-pointer" onClick={() => setListed(!listed)}>
          <p>{t('listed')}</p>
          <Checkbox id="listed" value={listed} setValue={setListed} placeholder={t('listed')} />
        </div>
        <div className="select-none flex flex-row justify-between items-center mt-4 mb-2 pl-4">
          <p className="break-keep mr-2">{t('created_at')}</p>
          <Calendar value={createdAt} onChange={(e) => setCreatedAt(e.value || undefined)} showTime touchUI hourFormat="24" />
        </div>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`${t('writing')} - ${process.env.NAME}`}</title>
        <meta property="og:site_name" content={siteName} />
        <style>
          {`
            /* 1. 仅保留预览区和渲染容器的样式 */
            .toc-content, .vditor-reset, .markdown-editor textarea {
              white-space: pre-wrap !important;
              word-break: break-all;
              font-size: ${fontSize} !important;
              line-height: ${lineHeight} !important;
              font-family: ${fontFamily} !important;
            }

            /* 2. 移除所有对 .monaco-editor 内部布局（height/line-height/cursor）的强制修改 */
            /* 因为这些现在由组件内部 options 原生计算，CSS 覆盖会导致错位 */
          `}
        </style>
      </Helmet>

      <div className="grid grid-cols-1 md:grid-cols-3 t-primary mt-2">
        <div className="col-span-2 pb-8">
          <div className="bg-w rounded-2xl shadow-xl shadow-light p-4">
            
            <div className="flex flex-wrap gap-4 mb-3 px-3 py-2 bg-gray-50 dark:bg-zinc-800/50 rounded-lg text-xs opacity-80 border border-gray-100 dark:border-zinc-700">
               <div className="flex items-center gap-2">
                 <span>字号:</span>
                 <select 
                   value={fontSize} 
                   onChange={(e) => { setFontSize(e.target.value); localStorage.setItem('rin-fontSize', e.target.value); }}
                   className="bg-transparent border-none outline-none cursor-pointer text-theme font-bold"
                 >
                   {['12px', '14px', '16px', '18px', '20px', '24px'].map(v => <option key={v} value={v}>{v}</option>)}
                 </select>
               </div>
               
               <div className="flex items-center gap-2 border-l pl-3 border-gray-300 dark:border-zinc-600">
                 <span>行距:</span>
                 <input 
                    type="range" min="1" max="2.5" step="0.1" 
                    value={lineHeight} 
                    onChange={(e) => { setLineHeight(Number(e.target.value)); localStorage.setItem('rin-lineHeight', e.target.value); }}
                    className="w-20 accent-theme"
                 />
                 <span className="w-6 font-mono">{lineHeight}</span>
               </div>

               <div className="flex items-center gap-2 border-l pl-3 border-gray-300 dark:border-zinc-600">
                 <span>字体:</span>
                 <select 
                   value={fontFamily} 
                   onChange={(e) => { setFontFamily(e.target.value); localStorage.setItem('rin-fontFamily', e.target.value); }}
                   className="bg-transparent border-none outline-none cursor-pointer text-theme font-bold"
                 >
                   <option value="Sarasa Mono SC, JetBrains Mono, monospace">更纱等宽</option>
                   <option value="'Noto Serif SC', serif">宋体/衬线</option>
                   <option value="system-ui, sans-serif">系统无衬线</option>
                 </select>
               </div>
            </div>

            {MetaInput({ className: "visible md:hidden mb-8" })}

            <MarkdownEditor 
                key={`${fontSize}-${fontFamily}-${lineHeight}`} 
                content={content} 
                setContent={setContent} 
                height='600px'
                fontSize={numericFontSize}
                lineHeight={actualLineHeight}
                fontFamily={fontFamily}
            />
          </div>
          
          <div className="visible md:hidden flex flex-row justify-center mt-8">
            <button onClick={publishButton} className="basis-1/2 bg-theme text-white py-4 rounded-full shadow-xl shadow-light flex flex-row justify-center items-center space-x-2">
              {publishing && <Loading type="spin" height={16} width={16} />}
              <span>{t('publish.title')}</span>
            </button>
          </div>
        </div>

        <div className="hidden md:visible max-w-96 md:flex flex-col">
          {MetaInput({ className: "bg-w rounded-2xl shadow-xl shadow-light p-4 mx-8" })}
          <div className="flex flex-row justify-center mt-8">
            <button onClick={publishButton} className="basis-1/2 bg-theme text-white py-4 rounded-full shadow-xl shadow-light flex flex-row justify-center items-center space-x-2">
              {publishing && <Loading type="spin" height={16} width={16} />}
              <span>{t('publish.title')}</span>
            </button>
          </div>
        </div>
      </div>
      <AlertUI />
    </>
  );
}
