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

  // 3. 截取逻辑
  if (cleaned.length <= 0) return ""; 

  const summaryResult = cleaned.slice(0, 150);
  
  // 4. 如果截取后的内容全是空格或特殊符号，确保至少能看到占位
  return summaryResult || "[图片]";
}
