import _ from 'lodash';
import { Calendar } from 'primereact/calendar';
import 'primereact/resources/primereact.css';
import 'primereact/resources/themes/lara-light-indigo/theme.css';
import { useCallback, useEffect, useState, useMemo } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import Loading from 'react-loading';
import { useAlert } from '../components/dialog';
import { Checkbox, Input } from "../components/input";
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";
import { Cache } from '../utils/cache';
import mermaid from 'mermaid';
import { MarkdownEditor } from '../components/markdown_editor';

export function WritingPage({ id }: { id?: number }) {
  const { t } = useTranslation();
  const cache = Cache.with(id);
  const [title, setTitle] = cache.useCache("title", "");
  const [summary, setSummary] = cache.useCache("summary", "");
  const [tags, setTags] = cache.useCache("tags", "");
  const [alias, setAlias] = cache.useCache("alias", "");
  const [content, setContent] = cache.useCache("content", "");
  
  const [draft, setDraft] = useState(false);
  const [listed, setListed] = useState(true);
  const [createdAt, setCreatedAt] = useState<Date | undefined>(new Date());
  const [publishing, setPublishing] = useState(false);
  const { showAlert, AlertUI } = useAlert();

  const fontFamily = localStorage.getItem('rin-fontFamily') || 'Sarasa Mono SC, JetBrains Mono, monospace';
  const safeId = id ? Number(id) : 0;

  // 定义发布函数
  const doPublish = async (payload: any) => {
    const { data, error } = await client.feed.index.post(payload, { headers: headersWithAuth() });
    setPublishing(false);
    if (error) showAlert(error.value as string);
    if (data && typeof data !== "string") {
      showAlert(t("publish.success"), () => {
        cache.clear();
        window.location.href = "/feed/" + data.insertedId;
      });
    }
  };

  // 定义更新函数
  const doUpdate = async (updateId: number, payload: any) => {
    const { error } = await client.feed({ id: updateId }).post(payload, { headers: headersWithAuth() });
    setPublishing(false);
    if (error) showAlert(error.value as string);
    else showAlert(t("update.success"), () => {
      cache.clear();
      window.location.href = "/feed/" + updateId;
    });
  };

  useEffect(() => {
    if (id) {
      client.feed({ id }).get({ headers: headersWithAuth() }).then(({ data }) => {
        if (data && typeof data !== "string") {
          // 直接赋值，不使用 prev 回调以兼容 cache setter 类型
          if (!title) setTitle(data.title || "");
          if (!tags) setTags(data.hashtags?.map(({ name }: any) => `#${name}`).join(" ") || "");
          if (!alias) setAlias(data.alias || "");
          if (!content) setContent(data.content || "");
          if (!summary) setSummary(data.summary || "");
          setListed(data.listed === 1);
          setDraft(data.draft === 1);
          setCreatedAt(new Date(data.createdAt));
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]); 

  const debouncedUpdate = useCallback(_.debounce(() => {
    mermaid.initialize({ startOnLoad: false, theme: "default" });
    mermaid.run({ suppressErrors: true, nodes: document.querySelectorAll("pre.mermaid_default") });
  }, 300), []);

  useEffect(() => { debouncedUpdate(); }, [content, debouncedUpdate]);

  const MetaInputUI = useMemo(() => (
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
  ), [title, summary, tags, alias, draft, listed, createdAt, safeId, t, setAlias, setContent, setSummary, setTags, setTitle]);

  function publishButton() {
    if (publishing) return;
    const tagsplit = tags.split("#").filter((tag) => tag !== "").map((tag) => tag.trim());
    const payload = { 
        title, content, summary, tags: tagsplit, draft, alias, listed, 
        createdAt: createdAt?.toISOString() 
    };
    
    setPublishing(true);
    if (id !== undefined) {
      doUpdate(Number(id), payload);
    } else {
      if (!title) { showAlert(t("title_empty")); setPublishing(false); return; }
      if (!content) { showAlert(t("content.empty")); setPublishing(false); return; }
      doPublish(payload);
    }
  }

  return (
    <>
      <Helmet>
        <title>{`${t('writing')} - Rin`}</title>
      </Helmet>
      
      <div className="grid grid-cols-1 md:grid-cols-3 t-primary mt-2">
        <div className="col-span-2 pb-8">
          <div className="bg-w rounded-2xl shadow-xl shadow-light p-4">
            <div className="md:hidden mb-8">{MetaInputUI}</div>
            <MarkdownEditor 
              key={fontFamily} 
              content={content} 
              setContent={setContent} 
              height='600px' 
              fontFamily={fontFamily} 
            />
          </div>
        </div>

        <div className="hidden md:flex flex-col">
          <div className="bg-w rounded-2xl shadow-xl shadow-light p-4 mx-8">
            {MetaInputUI}
          </div>
          <div className="flex flex-row justify-center mt-8">
            <button onClick={publishButton} className="basis-1/2 bg-theme text-white py-4 rounded-full shadow-xl shadow-light flex flex-row justify-center items-center space-x-2">
              {publishing && <Loading type="spin" height={16} width={16} />}
              <span>{id !== undefined ? t('update.title') : t('publish.title')}</span>
            </button>
          </div>
        </div>
      </div>
      <AlertUI />
    </>
  );
}
