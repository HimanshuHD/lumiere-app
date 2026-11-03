import { ServiceError } from './errors.ts';
export interface OpdsBook {
  title:string;author:string;summary:string;id:string;updated:string;coverUrl:string;
  downloadUrl:string;downloadType:string;catalogUrl:string;categories:string[];rights:string;
}
export interface OpdsFeedResult {title:string;subtitle:string;count:number;books:OpdsBook[]}
export function parseCatalogFeed(input:unknown):OpdsFeedResult {
  if(!input||typeof input!=='object'||!('books' in input)||!Array.isArray(input.books))throw new ServiceError('validation','The catalog returned an invalid book list.');
  const value=input as Record<string,unknown>;
  const text=(record:Record<string,unknown>,key:string)=>typeof record[key]==='string'?record[key] as string:'';
  const books=input.books.map((item:unknown):OpdsBook=>{
    if(!item||typeof item!=='object'||!('title' in item)||typeof item.title!=='string')throw new ServiceError('validation','The catalog returned an invalid book.');
    const book=item as Record<string,unknown>;
    return {title:item.title,author:text(book,'author'),summary:text(book,'summary'),id:text(book,'id'),updated:text(book,'updated'),coverUrl:text(book,'coverUrl'),downloadUrl:text(book,'downloadUrl'),downloadType:text(book,'downloadType'),catalogUrl:text(book,'catalogUrl'),rights:text(book,'rights'),categories:Array.isArray(book.categories)?book.categories.filter((v:unknown):v is string=>typeof v==='string'):[]};
  });
  return {title:text(value,'title'),subtitle:text(value,'subtitle'),count:typeof value.count==='number'&&Number.isFinite(value.count)?value.count:books.length,books};
}
