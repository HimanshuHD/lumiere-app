export interface TextChapter {
  title: string;
  content: string;
}

export function textToChapters(text: string): TextChapter[] {
  const normalized = text.replace(/\r\n/g, '\n');
  const sections = normalized.split(/\n{3,}/);
  if (sections.length <= 1) {
    const chunks: string[] = [];
    const paragraphs = normalized.split(/\n{2,}/);
    let current = '';
    for (const paragraph of paragraphs) {
      if ((current + paragraph).length > 5000 && current) {
        chunks.push(current);
        current = paragraph;
      } else {
        current = current ? `${current}\n\n${paragraph}` : paragraph;
      }
    }
    if (current) chunks.push(current);
    return chunks.map((content, index) => ({
      title: `Section ${index + 1}`,
      content,
    }));
  }
  return sections.map((content, index) => ({
    title: `Section ${index + 1}`,
    content: content.trim(),
  }));
}
