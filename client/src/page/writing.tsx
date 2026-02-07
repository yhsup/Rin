import i18n from 'i18next';
import _ from 'lodash';
import { Calendar } from 'primereact/calendar';
import 'primereact/resources/primereact.css';
import 'primereact/resources/themes/lara-light-indigo/theme.css';
import { useCallback, useEffect, useState } from "react";
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

// 外部定义的发布函数
async function publish({
  title, alias, listed, content, summary, tags, draft, createdAt, onCompleted, showAlert
}: {
  title: string; listed: boolean; content: string; summary: string; tags: string[]; draft: boolean;
  alias?: string; createdAt?: Date; onCompleted?: () => void; showAlert: ShowAlertType;
}) {
  const t = i18n.t
  const { data, error } = await client.feed.index.post(
    { title, alias, content, summary, tags, listed, draft, createdAt },
    { headers: headersWithAuth() }
  );
  if (onCompleted) onCompleted();
  if (error) showAlert(error.value as string);
  if (data && typeof data !== "string") {
    showAlert(t("publish.success"), () => {
      Cache.with().clear();
      window.location.href = "/feed/" + data.insertedId;
    });
  }
}

// 外部定义的更新函数
async function update({
  id, title, alias, content, summary, tags, listed, draft, createdAt, onCompleted, showAlert
}: {
  id: number; listed: boolean; title?: string; alias?: string; content?: string; summary?: string;
  tags?: string[]; draft?: boolean; createdAt?: Date; onCompleted?: () => void; showAlert: ShowAlertType;
}) {
  const t = i18n.t
  const { error } = await client.feed({ id }).post(
    { title, alias, content, summary, tags, listed, draft, createdAt },
    { headers: headersWithAuth() }
  );
  if (onCompleted) onCompleted();
  if (error) showAlert(error.value as string);
  else {
    showAlert(t("update.success"), () => {
      Cache.with(id).clear();
      window.location.href = "/feed/" + id;
    });
  }
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
  const [publishing, setPublishing] = useState(false)
  const { showAlert, AlertUI } = useAlert()

  // 辅助函数：将 Markdown 转换为摘要纯文本（含图片占位）
  const generateAutoSummary = (text: string) => {
    // 1. 先把所有的图片标签 ![]() 替换为 [图片] 占位符
    let cleaned = text.replace(/!\[.*?\]\(.*?\)/g, '[图片]');

    // 2. 剥离其他 Markdown 标签
    cleaned = cleaned
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')    // 移除链接地址，保留链接文字
      .replace(/<[^>]*>/g, '')               // 移除 HTML 标签
      .replace(/[#*`~>]/g, '')               // 移除 Markdown 特殊符号
      .replace(/\s+/g, ' ')                  // 合并换行和多余空格
      .trim();

    // 3. 截取前 150 字
    return cleaned.slice(0, 150) || (text.includes('![') ? "[图片]" : "");
  }

  function publishButton() {
    if (publishing) return;
    const tagsplit = tags.split("#").filter((tag) => tag !== "").map((tag) => tag.trim()) || [];
    
    // 如果没有输入简介，则自动生成含占位符的摘要
    const finalSummary = summary.trim() === "" ? generateAutoSummary(content) : summary;

    setPublishing(true);
    const commonProps = { 
      title, 
      content, 
      summary: finalSummary, 
      alias, 
      tags: tagsplit, 
      draft, 
      listed, 
      createdAt, 
      showAlert, 
      onCompleted: () => setPublishing(false) 
    };
    
    if (id !== undefined) {
      update({ id, ...commonProps });
    } else {
      if (!title) { showAlert(t("title_empty")); setPublishing(false); return; }
      if (!content) { showAlert(t("content.empty")); setPublishing(false); return; }
      publish(commonProps);
    }
  }

  // 初始化数据
  useEffect(() => {
    if (id) {
      client.feed({ id }).get({ headers: headersWithAuth() }).then(({ data }) => {
        if (data && typeof data !== "string") {
          setTitle(data.title || "");
          if (data.hashtags) setTags(data.hashtags.map(({ name }: any) => `#${name}`).join(" "));
          setAlias(data.alias || "");
          setContent(data.content || "");
          setSummary(data.summary || "");
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
      mermaid.run({ suppressErrors: true, nodes: document.querySelectorAll("pre.mermaid_default") });
    }, 100),
    []
  );

  useEffect(() => {
    debouncedUpdate();
  }, [content, debouncedUpdate]);

  const MetaInput = ({ className }: { className?: string }) => (
    <div className={className}>
      <Input id={id} value={title} setValue={setTitle} placeholder={t("title")} />
      <Input id={id} value={summary} setValue={setSummary} placeholder={t("summary_optional") || "简介 (可选，默认为正文提取)"} className="mt-4" />
      <Input id={id} value={tags} setValue={setTags} placeholder={t("tags")} className="mt-4" />
      <Input id={id} value={alias} setValue={setAlias} placeholder={t("alias")} className="mt-4" />
      <div className="select-none flex flex-row justify-between items-center mt-6 mb-2 px-4" onClick={() => setDraft(!draft)}>
        <p>{t('visible.self_only')}</p>
        <Checkbox id="draft" value={draft} setValue={setDraft} placeholder={t('draft')} />
      </div>
      <div className="select-none flex flex-row justify-between items-center mt-6 mb-2 px-4" onClick={() => setListed(!listed)}>
        <p>{t('listed')}</p>
        <Checkbox id="listed" value={listed} setValue={setListed} placeholder={t('listed')} />
      </div>
      <div className="select-none flex flex-row justify-between items-center mt-4 mb-2 pl-4">
        <p className="break-keep mr-2">{t('created_at')}</p>
        <Calendar value={createdAt} onChange={(e) => setCreatedAt(e.value || undefined)} showTime touchUI hourFormat="24" />
      </div>
    </div>
  );

  return (
    <>
      <Helmet>
        <title>{`${t('writing')} - ${process.env.NAME}`}</title>
        <meta property="og:site_name" content={siteName} />
      </Helmet>
      
      <div className="grid grid-cols-1 md:grid-cols-3 t-primary mt-2 gap-4">
        <div className="col-span-1 md:col-span-2 pb-8">
          <div className="bg-w rounded-2xl shadow-xl shadow-light p-4">
            <MetaInput className="block md:hidden mb-8 border-b pb-6 dark:border-zinc-800" />
            <MarkdownEditor content={content} setContent={setContent} height='600px' />
            <div className="block md:hidden flex flex-row justify-center mt-8">
              <button
                onClick={publishButton}
                disabled={publishing}
                className="w-full bg-theme text-white py-4 rounded-full shadow-lg flex flex-row justify-center items-center space-x-2 active:opacity-80"
              >
                {publishing && <Loading type="spin" height={16} width={16} />}
                <span>{id !== undefined ? t('update.title') : t('publish.title')}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="hidden md:flex flex-col">
          <MetaInput className="bg-w rounded-2xl shadow-xl shadow-light p-4 mx-8" />
          <div className="flex flex-row justify-center mt-8 px-8">
            <button
              onClick={publishButton}
              disabled={publishing}
              className="w-full bg-theme text-white py-4 rounded-full shadow-xl shadow-light flex flex-row justify-center items-center space-x-2 hover:opacity-90 transition-opacity"
            >
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
