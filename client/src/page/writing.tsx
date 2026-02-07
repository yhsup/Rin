import i18n from 'i18next';
import _ from 'lodash';
import { Calendar } from 'primereact/calendar';
import 'primereact/resources/primereact.css';
import 'primereact/resources/themes/lara-light-indigo/theme.css';
import { useCallback, useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import Loading from 'react-loading';
import { ShowAlertType, useAlert } from '../components/dialog';
import { Checkbox, Input } from "../components/input";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";
import { Cache } from '../utils/cache';
import { siteName } from "../utils/constants";
import mermaid from 'mermaid';
import { MarkdownEditor } from '../components/markdown_editor';

// ...（publish 和 update 函数保持不变）

export function WritingPage({ id }: { id?: number }) {
  const { t } = useTranslation();
  const cache = Cache.with(id);
  const [title, setTitle] = cache.useCache("title", "");
  const [summary, setSummary] = cache.useCache("summary", "");
  const [tags, setTags] = cache.useCache("tags", "");
  const [alias, setAlias] = cache.useCache("alias", "");
  
  // 关键修复：将 draft 和 listed 也放入 cache 或确保它们不会在渲染时被重置
  const [draft, setDraft] = useState(false);
  const [listed, setListed] = useState(true);
  
  const [content, setContent] = cache.useCache("content", "");
  const [createdAt, setCreatedAt] = useState<Date | undefined>(new Date());
  const [publishing, setPublishing] = useState(false);
  const { showAlert, AlertUI } = useAlert();

  const [fontFamily, setFontFamily] = useState(localStorage.getItem('rin-fontFamily') || 'Sarasa Mono SC, JetBrains Mono, monospace');

  const safeId = id ? Number(id) : 0;

  // 1. 远程数据获取（仅执行一次）
  useEffect(() => {
    if (id) {
      client.feed({ id }).get({ headers: headersWithAuth() }).then(({ data }) => {
        if (data && typeof data !== "string") {
          // 仅当本地缓存为空时才填充，防止覆盖正在编辑的内容
          setTitle(prev => prev || data.title || "");
          setTags(prev => prev || data.hashtags?.map(({ name }: any) => `#${name}`).join(" ") || "");
          setAlias(prev => prev || data.alias || "");
          setContent(prev => prev || data.content || "");
          setSummary(prev => prev || data.summary || "");
          setListed(data.listed === 1);
          setDraft(data.draft === 1);
          setCreatedAt(new Date(data.createdAt));
        }
      });
    }
  }, [id]); // 注意：这里去掉了多余的依赖项

  // 2. Mermaid 渲染逻辑
  const debouncedUpdate = useCallback(_.debounce(() => {
    mermaid.initialize({ startOnLoad: false, theme: "default" });
    mermaid.run({ suppressErrors: true, nodes: document.querySelectorAll("pre.mermaid_default") });
  }, 300), []);

  useEffect(() => { debouncedUpdate(); }, [content, debouncedUpdate]);

  // 3. 核心修复：使用 useMemo 包裹侧边栏组件，防止 content 改变导致侧边栏刷新
  const MetaInputUI = useMemo(() => {
    return (
      <div className="flex flex-col">
        <Input id={safeId} value={title} setValue={setTitle} placeholder={t("title")} />
        <Input id={safeId} value={summary} setValue={setSummary} placeholder={t("summary")} className="mt-4" />
        <Input id={safeId} value={tags} setValue={setTags} placeholder={t("tags")} className="mt-4" />
        <Input id={safeId} value={alias} setValue={setAlias} placeholder={t("alias")} className="mt-4" />
        
        <div className="select-none flex flex-row justify-between items-center mt-6 mb-2 px-4 cursor-pointer" 
             onClick={() => setDraft(!draft)}>
          <p>{t('visible.self_only')}</p>
          <Checkbox id="draft" value={draft} setValue={setDraft} placeholder={t('draft')} />
        </div>
        
        <div className="select-none flex flex-row justify-between items-center mt-6 mb-2 px-4 cursor-pointer" 
             onClick={() => setListed(!listed)}>
          <p>{t('listed')}</p>
          <Checkbox id="listed" value={listed} setValue={setListed} placeholder={t('listed')} />
        </div>
        
        <div className="select-none flex flex-row justify-between items-center mt-4 mb-2 pl-4">
          <p className="break-keep mr-2">{t('created_at')}</p>
          <Calendar value={createdAt} onChange={(e) => setCreatedAt(e.value || undefined)} showTime touchUI hourFormat="24" />
        </div>
      </div>
    );
  }, [title, summary, tags, alias, draft, listed, createdAt, safeId, t]); // 仅当这些元数据变化时才刷新 UI

  function publishButton() {
    if (publishing) return;
    const tagsplit = tags.split("#").filter((tag) => tag !== "").map((tag) => tag.trim());
    const payload = { title, content, summary, tags: tagsplit, draft, alias, listed, createdAt, onCompleted: () => setPublishing(false), showAlert };
    setPublishing(true);
    if (id !== undefined) update({ id: Number(id), ...payload });
    else publish(payload);
  }

  return (
    <>
      <Helmet>
        <title>{`${t('writing')} - ${process.env.NAME}`}</title>
        <style>
          {`
            .vditor-reset, .toc-content, .markdown-content { font-family: ${fontFamily} !important; }
            .toc-content table { border-collapse: collapse; width: 100%; margin: 16px 0; border: 1px solid #ddd; }
            .toc-content th, .toc-content td { border: 1px solid #ddd; padding: 8px; }
          `}
        </style>
      </Helmet>
      
      <div className="grid grid-cols-1 md:grid-cols-3 t-primary mt-2">
        <div className="col-span-2 pb-8">
          <div className="bg-w rounded-2xl shadow-xl shadow-light p-4">
            {/* 顶部字体切换等... */}
            <div className="md:hidden mb-8">{MetaInputUI}</div>
            <MarkdownEditor key={fontFamily} content={content} setContent={setContent} height='600px' fontFamily={fontFamily} />
          </div>
        </div>

        <div className="hidden md:flex flex-col">
          <div className="bg-w rounded-2xl shadow-xl shadow-light p-4 mx-8">
            {MetaInputUI}
          </div>
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
