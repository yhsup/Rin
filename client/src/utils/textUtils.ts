// client/src/utils/textUtils.ts

/**
 * 动态生成摘要：提取正文第一句话，并处理图片和表格占位
 */
export const getAutoSummary = (content: string): string => {
  if (!content) return "";

  // 1. 处理占位符
  let cleaned = content
    // 将图片替换为 [图片]
    .replace(/!\[.*?\]\(.*?\)/g, '[图片]')
    // 将 Markdown 表格块替换为 [表格]
    // 匹配从 | 开始到行尾，且包含至少一个换行的结构
    .replace(/(\n|^)\|(.+?)\|[\s\S]+?(\n\n|$)/g, '$1[表格]$3');

  // 2. 剥离 Markdown 标签
  cleaned = cleaned
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')    // 移除链接，只留文字
    .replace(/<[^>]*>/g, '')               // 移除 HTML
    .replace(/[#*`~>]/g, '')               // 移除 # * ` ~ > 等符号
    .replace(/\s+/g, ' ')                  // 把所有换行符、多余空格变成一个空格
    .trim();

  if (!cleaned) return "";

  // 3. 匹配第一句话
  // 正则逻辑：匹配直到遇到第一个 中文句号、英文句号、感叹号、问号
  const firstSentenceMatch = cleaned.match(/^.*?[。\.？！?!]/);
  
  const result = firstSentenceMatch 
    ? firstSentenceMatch[0] 
    : cleaned.slice(0, 100); // 如果通篇没句号，截取前100字

  return result.trim();
};
