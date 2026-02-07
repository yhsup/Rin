import { useCallback, useEffect, useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Calendar } from 'primereact/calendar';
import Loading from 'react-loading';
import { useAlert } from '../components/dialog';
import { Checkbox, Input } from "../components/input";
import { Cache } from '../utils/cache';
import { MarkdownEditor } from '../components/markdown_editor';
import { client } from "../main";
import { headersWithAuth } from "../utils/auth";
import 'primereact/resources/themes/lara-light-indigo/theme.css';
import 'primereact/resources/primereact.css';

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

  // 字体排版状态
  const [fontSize, setFontSize] = useState(localStorage.getItem('rin-fontSize') || '16px');
  const [fontFamily, setFontFamily] = useState(localStorage.getItem('rin-fontFamily') || 'Sarasa Mono SC, sans-serif');
  const [lineHeight] = useState(Number(localStorage.getItem('rin-lineHeight')) || 1.6);

  const numericFontSize = parseInt(fontSize);
  const actualLineHeight = Math.round(numericFontSize * lineHeight);

  // 初始化加载数据
  useEffect(() => {
    if (id) {
      client.feed({ id }).get({ headers: headersWithAuth() }).then(({ data }) => {
        if (data && typeof data !== "string") {
          if (title === "") setTitle(data.title || "");
          if (content === "") setContent(data.content || "");
          if (summary === "") setSummary(data.summary || "");
          if (tags === "" && data.hashtags) setTags(data.hashtags.map((h: any) => `#${h.name}`).join(" "));
          setAlias(data.alias || "");
          setDraft(data.draft === 1);
          setListed(data.listed === 1);
          setCreatedAt(new Date(data.createdAt));
        }
      });
    }
  }, [id, setTitle, setContent, setSummary, setTags, setAlias]);

  const handlePublish = useCallback(async () => {
    if (publishing) return;
    if (!title || !content) {
      showAlert(t("content.empty"));
      return;
    }
    setPublishing(true);
    const tagsplit = tags.split("#").filter(tag => tag.trim() !== "").map(tag => tag.trim());
    
    const payload = { title, content, summary, tags: tagsplit, draft, alias, listed, createdAt: createdAt || new Date() };
    
    const { data, error } = id 
      ? await client.feed({ id }).post(payload, { headers: headersWithAuth() })
      : await client.feed.index.post(payload, { headers: headersWithAuth() });

    setPublishing(false);
    if (error) {
      showAlert(error.value as string);
    } else {
      showAlert(t(id ? "update.success" : "publish.success"), () => {
        cache.clear();
        window.location.href = `/feed/${id || (data as any).insertedId}`;
      });
    }
  }, [id, title, content, summary, tags, draft, alias, listed, createdAt, publishing, t, showAlert, cache]);

  function MetaFields() {
    return (
      <div className="flex flex-col gap-4">
        <Input id="summary" value={summary} setValue={setSummary} placeholder={t("summary")} />
        <Input id="tags" value={tags} setValue={setTags} placeholder={t("tags")} />
        <Input id="alias" value={alias} setValue={setAlias} placeholder={t("alias")} />
        
        <div className="flex items-center justify-between px-2 py-1 cursor-pointer select-none" onClick={() => setDraft(!draft)}>
          <span className="text-sm">{t("visible.self_only")}</span>
          <Checkbox id="draft" value={draft} setValue={setDraft} placeholder={t("draft")} />
        </div>

        <div className="flex items-center justify-between px-2 py-1 cursor-pointer select-none" onClick={() => setListed(!listed)}>
          <span className="text-sm">{t("listed")}</span>
          <Checkbox id="listed" value={listed} setValue={setListed} placeholder={t("listed")} />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs text-neutral-500 ml-1">{t("created_at")}</span>
          <Calendar value={createdAt} onChange={(e) => setCreatedAt(e.value || undefined)} showTime hourFormat="24" className="w-full" touchUI />
        </div>

        <button 
          onClick={handlePublish}
          disabled={publishing}
          className="w-full bg-theme text-white py-3 rounded-xl shadow-lg flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {publishing && <Loading type="spin" width={16} height={16} color="#fff" />}
          {id ? t("update.title") : t("publish.title")}
        </button>
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{`${t('writing')} - Rin`}</title>
        <link href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=Noto+Serif+SC:wght@400;700&family=Zhi+Mang+Xing&display=swap" rel="stylesheet" />
        <style>{`
          .vditor-reset, .markdown-content { font-size: ${fontSize} !important; line-height: ${lineHeight} !important; font-family: ${fontFamily} !important; }
          .vditor-reset u { text-decoration: underline; }
          .vditor-reset sup { vertical-align: super; font-size: 0.8em; }
          .vditor-reset sub { vertical-align: sub; font-size: 0.8em; }
          .monaco-editor .view-line { transform: none !important; }
        `}</style>
      </Helmet>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4 max-w-7xl mx-auto">
        {/* 左侧编辑器区 */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-4 border dark:border-zinc-800">
            {/* 全局排版工具 */}
            <div className="flex gap-4 mb-4 text-[10px] uppercase tracking-wider text-neutral-500 border-b pb-2 dark:border-zinc-800">
              <label>字号: 
                <select 
                    value={fontSize} 
                    onChange={e => { setFontSize(e.target.value); localStorage.setItem('rin-fontSize', e.target.value); }} 
                    className="bg-transparent text-theme font-bold ml-1 outline-none"
                >
                  {['14px', '16px', '18px', '20px', '24px'].map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </label>
              <label>全局字体: 
                <select 
                    value={fontFamily} 
                    onChange={e => { setFontFamily(e.target.value); localStorage.setItem('rin-fontFamily', e.target.value); }} 
                    className="bg-transparent text-theme font-bold ml-1 outline-none"
                >
                  <option value="Sarasa Mono SC">更纱等宽</option>
                  <option value="Noto Serif SC">思源宋体</option>
                  <option value="system-ui">系统默认</option>
                </select>
              </label>
            </div>

            <Input id="title" value={title} setValue={setTitle} placeholder={t("title")} className="mb-4 text-2xl font-bold border-none !px-0 focus:ring-0" />
            
            <MarkdownEditor 
              key={`${fontSize}-${fontFamily}`}
              content={content} 
              setContent={setContent} 
              height="650px"
              fontSize={numericFontSize}
              lineHeight={actualLineHeight}
              fontFamily={fontFamily}
            />
          </div>
        </div>

        {/* 右侧元数据区 */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-xl p-6 border dark:border-zinc-800 sticky top-4">
            <h2 className="text-sm font-bold mb-4 flex items-center gap-2">
              <i className="ri-settings-3-line" /> {t("settings") || "文章设置"}
            </h2>
            <MetaFields />
          </div>
        </div>
      </div>
      <AlertUI />
    </>
  );
}
