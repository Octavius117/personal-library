/**
 * MyBookshelf ISBN catalog service.
 * Pure parsing/validation plus real, multi-provider bibliographic retrieval.
 * No ISBN-specific results, no hardcoded book records, no key material.
 */
export function normalizeISBN(raw) {
  const value=String(raw??"").toUpperCase().replace(/[^0-9X]/g,"");
  if (/^97[89][0-9]{10}/.test(value)) return value.slice(0,13); // trim EAN price supplement
  if (/^[0-9]{9}[0-9X]$/.test(value)) return value;
  return value;
}
export function isValidISBN(isbn) {
  const s=normalizeISBN(isbn);
  if (/^[0-9]{13}$/.test(s)) {
    return [...s].reduce((sum,ch,i)=>sum+Number(ch)*(i%2?3:1),0)%10===0;
  }
  if (/^[0-9]{9}[0-9X]$/.test(s)) {
    return [...s].reduce((sum,ch,i)=>sum+(ch==="X"?10:Number(ch))*(10-i),0)%11===0;
  }
  return false;
}
export function isbn10To13(isbn10) {
  if(!/^[0-9]{9}[0-9X]$/.test(isbn10)||!isValidISBN(isbn10)) return null;
  const body="978"+isbn10.slice(0,9);
  const check=(10-([...body].reduce((sum,ch,i)=>sum+Number(ch)*(i%2?3:1),0)%10))%10;
  return body+check;
}
function matchesExactISBN(candidate,requested){
  const a=normalizeISBN(candidate),b=normalizeISBN(requested);
  if (!isValidISBN(a)||!isValidISBN(b)) return false;
  return a===b || isbn10To13(a)===b || isbn10To13(b)===a;
}
function safeCover(url) {return typeof url==="string"?url.replace(/^http:/i,"https:"):null}
function authorNames(list){return Array.isArray(list)?list.filter(x=>typeof x==="string").slice(0,5):[]}
function type(status){if(status===429)return "rate_limited";if(status===404)return "not_found";return "network_error"}
async function getJson(url,fetcher,timeout){
  const ctrl=new AbortController(),tid=setTimeout(()=>ctrl.abort(),timeout);
  try{
    const response=await fetcher(url,{signal:ctrl.signal,cache:"no-store"});
    if(!response.ok) return {ok:false,error:type(response.status),httpStatus:response.status};
    return {ok:true,data:await response.json()};
  }catch(e){return {ok:false,error:"network_error",reason:String(e?.message??e)}}
  finally{clearTimeout(tid)}
}
async function fromOpenLibrary(isbn,fetcher,timeout){
  const r=await getJson("https://openlibrary.org/isbn/"+encodeURIComponent(isbn)+".json",fetcher,timeout);
  if(!r.ok)return r;
  const d=r.data;
  if(!d?.title)return {ok:false,error:"network_error",reason:"Open Library response missing title"};
  if(Array.isArray(d.isbn_13)||Array.isArray(d.isbn_10)){
    const ids=[...(d.isbn_13||[]),...(d.isbn_10||[])];
    if(ids.length&&!ids.some(x=>matchesExactISBN(x,isbn)))return {ok:true,book:null};
  }
  let authors=[];
  if(Array.isArray(d.authors)){
    const keys=d.authors.map(a=>a.key).filter(Boolean).slice(0,5);
    const names=await Promise.all(keys.map(async key=>{
      const a=await getJson("https://openlibrary.org"+key+".json",fetcher,timeout);
      return a.ok?a.data?.name:null;
    }));
    authors=authorNames(names);
  }
  return {ok:true,book:{
    isbn,title:d.title,authors,
    coverUrl:"https://covers.openlibrary.org/b/isbn/"+encodeURIComponent(isbn)+"-L.jpg",
    publisher:d.publishers?.[0]??null,
    year:d.publish_date??null,source:"openlibrary"
  }};
}
async function fromGoogleBooks(isbn,fetcher,timeout){
  const url="https://www.googleapis.com/books/v1/volumes?q="+encodeURIComponent("isbn:"+isbn)+"&maxResults=10";
  const r=await getJson(url,fetcher,timeout);
  if(!r.ok)return r;
  const books=r.data?.items||[];
  const exact=books.find(entry=>(entry?.volumeInfo?.industryIdentifiers||[]).some(id=>matchesExactISBN(id.identifier,isbn)));
  if(!exact)return {ok:true,book:null};
  const v=exact.volumeInfo;
  return {ok:true,book:{
    isbn,title:v.title,authors:authorNames(v.authors),
    coverUrl:safeCover(v.imageLinks?.large||v.imageLinks?.medium||v.imageLinks?.thumbnail||v.imageLinks?.smallThumbnail),
    publisher:v.publisher??null,year:v.publishedDate??null,description:v.description??null,
    source:"googlebooks"
  }};
}
async function fromOpenLibrarySearch(isbn,fetcher,timeout){
  const url="https://openlibrary.org/search.json?isbn="+encodeURIComponent(isbn)+"&limit=10";
  const r=await getJson(url,fetcher,timeout);
  if(!r.ok)return r;
  const exact=(r.data?.docs||[]).find(d=>(d.isbn||[]).some(id=>matchesExactISBN(id,isbn)));
  if(!exact)return {ok:true,book:null};
  return {ok:true,book:{
    isbn,title:exact.title,authors:authorNames(exact.author_name),
    coverUrl:exact.cover_i?"https://covers.openlibrary.org/b/id/"+exact.cover_i+"-L.jpg":null,
    year:exact.first_publish_year??null,source:"openlibrary"
  }};
}
/**
 * @returns {{status:'found',book:object}|{status:'not_found'}|
 * {status:'invalid_isbn'}|{status:'network_error'|'rate_limited',details:object[]}}
 */
export async function lookupISBN(raw,{fetcher=fetch,timeout=9000}={}){
  const isbn=normalizeISBN(raw);
  if(!isValidISBN(isbn))return {status:"invalid_isbn",isbn};
  const sources=await Promise.all([
    fromOpenLibrary(isbn,fetcher,timeout),
    fromGoogleBooks(isbn,fetcher,timeout),
    fromOpenLibrarySearch(isbn,fetcher,timeout)
  ]);
  // Prioritize source data containing usable title/author details; do not invent metadata.
  const matches=sources.filter(result=>result.ok&&result.book?.title).map(result=>result.book);
  if(matches.length){
    const ranked=matches.sort((a,b)=>(Boolean(b.coverUrl)-Boolean(a.coverUrl))*2+(b.authors.length-a.authors.length));
    const best={...ranked[0]};
    if(!best.coverUrl){best.coverUrl=ranked.find(x=>x.coverUrl)?.coverUrl??null}
    if(!best.authors.length){best.authors=ranked.find(x=>x.authors.length)?.authors??[]}
    return {status:"found",book:best};
  }
  const issues=sources.filter(r=>!r.ok&&r.error!=="not_found");
  if(issues.length)return {status:issues.some(x=>x.error==="rate_limited")?"rate_limited":"network_error",details:issues};
  return {status:"not_found",isbn};
}
