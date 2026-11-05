import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import type { PageViewport } from 'pdfjs-dist/types/src/display/display_utils';
import type { IPDFLinkService } from 'pdfjs-dist/types/web/interfaces';
import { destinationPage, safePdfUrl } from './pdf-links.ts';

export interface PageLayers {
  cancel(): void;
  render(page: PDFPageProxy, viewport: PageViewport, current: () => boolean): Promise<void>;
}
/** One owner for text, links and their cancellation. PDF scripts/forms/attachments are not executed. */
export class PdfPageLayers implements PageLayers {
  private textTask?: {cancel(): void};
  constructor(private document: PDFDocumentProxy,
    private elements: () => {page: HTMLDivElement | null; text: HTMLDivElement | null; links: HTMLDivElement | null},
    private navigate: (page: number) => void, private textAvailable: (available: boolean) => void,
    private linkError: (message: string) => void) {}
  cancel() {
    this.textTask?.cancel(); this.textTask = undefined;
    const {text, links} = this.elements(); text?.replaceChildren(); links?.replaceChildren();
  }
  async render(page: PDFPageProxy, viewport: PageViewport, current: () => boolean) {
    const hosts = this.elements();
    if (!hosts.page || !hosts.text || !hosts.links || !current()) return;
    const pdfjs = await import('pdfjs-dist');
    const [content, annotations] = await Promise.all([page.getTextContent(), page.getAnnotations({intent:'display'})]);
    if (!current()) return;
    hosts.page.style.width = `${viewport.width}px`; hosts.page.style.height = `${viewport.height}px`;
    hosts.page.style.setProperty('--scale-factor', String(viewport.scale));
    const text = document.createElement('div'); text.className = 'textLayer'; text.style.visibility = 'hidden';
    text.setAttribute('role','region'); text.setAttribute('aria-label',`Text of PDF page ${page.pageNumber}`);
    if (content.lang) text.lang = content.lang;
    hosts.text.replaceChildren(text);
    const task = new pdfjs.TextLayer({textContentSource:content, container:text, viewport});
    this.textTask = task; await task.render();
    if (!current()) return;
    text.style.visibility = '';
    this.textAvailable(content.items.some(item => 'str' in item && item.str.trim().length > 0));
    const links = document.createElement('div'); links.className = 'annotationLayer';
    const jump = (target: number) => { if (current() && Number.isInteger(target) && target >= 1 && target <= this.document.numPages) this.navigate(target); };
    const named = ['NextPage','PrevPage','FirstPage','LastPage'];
    const service: IPDFLinkService = {
      pagesCount:this.document.numPages, page:page.pageNumber, rotation:viewport.rotation, isInPresentationMode:false, externalLinkEnabled:true,
      goToDestination:async destination => { try { const target = await destinationPage(this.document,destination); if (target !== null) jump(target); else if(current()) this.linkError('The linked PDF destination is unavailable.'); } catch { if(current()) this.linkError('The linked PDF destination is unavailable.'); } },
      goToPage:value => jump(Number(value)),
      addLinkAttributes:(link, url) => { const safe = safePdfUrl(url); if (safe) { link.href=safe;link.target='_blank';link.rel='noopener noreferrer'; } },
      getDestinationHash:()=>'#pdf-destination', getAnchorUrl:()=>'#pdf-destination', setHash:()=>{}, executeSetOCGState:()=>{},
      executeNamedAction:action => jump(action === 'NextPage' ? page.pageNumber+1 : action === 'PrevPage' ? page.pageNumber-1 : action === 'FirstPage' ? 1 : action === 'LastPage' ? this.document.numPages : NaN),
    };
    const supported = annotations.filter(annotation => annotation.subtype === 'Link' &&
      (annotation.url ? !!safePdfUrl(annotation.url) : !!annotation.dest || named.includes(annotation.action)));
    const annotationViewport = viewport.clone({dontFlip:true});
    const layer = new pdfjs.AnnotationLayer({div:links, page, viewport:annotationViewport, accessibilityManager:null,annotationCanvasMap:null,annotationEditorUIManager:null});
    await layer.render({viewport:annotationViewport,div:links,annotations:supported,page,linkService:service,renderForms:false,enableScripting:false});
    if (!current()) return;
    for (const link of links.querySelectorAll('a')) {
      const external = link.target === '_blank';
      link.setAttribute('aria-label', external ? `Open external link: ${link.href}` : 'Go to linked location in this PDF');
    }
    hosts.links.replaceChildren(links);
  }
}
