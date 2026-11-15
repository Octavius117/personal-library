/**
 * MyBookshelf catalog service.
 * Live bibliographic sources only. Never substitutes a known ISBN with a fabricated record.
 * Search-by-title is explicitly user-initiated and does not claim edition equivalence.
 */
export function normalizeISBN(raw) {
  const value=String(raw??"").toUpperCase().replace(/[^0-9X]/g,"");
  const isbn13=value.match(/^97[89][0-9]{10}/);
  if(isbn13)return isbn13[0]; // A 5-digit retail price supplement may follow EAN-13.
  if(/^[0-9]{9}[0-9X]$/.test(value))return value;
  return value;
}
export function isValidISBN(raw) {
  const s=normalizeISBN(raw);
  if(/^97[89][0-9]{10}$/.test(s))return [...s].reduce((n,c,i)=>n+Number(c)*(i%2?3:1),0)%10===0;
  if(/^[0-9]{9}[0-9X]$/.test(s))return [...s].reduce((n,c,i)=>n+(c==="X"?10:Number(c))*(10-i),0)%11===0;
  return false;
}
export function isbn10To13(isbn10) {
  if(!/^[0-9]{9}[0-9X]$/.test(isbn10)||!isValidISBN(isbn10))return null;
  const head="978"+isbn10.slice(0,9);
  const n=[...head].reduce((sum,c,i)=>sum+Number(c)*(i%2?3:1),0);
  return head+String((10-n%10)%10);
}
function exactMatch(a,b) {
  const x=normalizeISBN(a),y=normalizeISBN(b);
  if(!isValidISBN(x)||!isValidISBN(y))return false;
  return x===y||isbn10To13(x)===y||isbn10To13(y)===x;
}
function authorNames(value){return Array.isArray(value)?value.filter(s=>typeof s==="string"&&s.trim()).slice(0,5):[]}
function coverUrl(v){return typeof v==="string"&&/^https?:\/\//.test(v)?v.replace(/^http:/i,"https:"):null}
function statusType(status) {
  if(status===404)return "not_found";
  if(status===429)return "rate_limited";
  if(status===403)return "access_denied";
  if(status>=500)return "service_unavailable";
  return "network_error";
}
async function readJSON(url,fetcher,timeout) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try {
    const response=await fetcher(url,{signal:controller.signal,cache:"no-store",headers:{Accept:"application/json"}});
    if(!response.ok)return {ok:false,error:statusType(response.status),httpStatus:response.status,url};
    return {ok:true,data:await response.json()};
  }catch(e){return {ok:false,error:"network_error",reason:String(e?.message||e),url}}
  finally{clearTimeout(timer)}
}
function fromSearchDoc(d,isbn) {
  if(!d||!Array.isArray(d.isbn)||!d.isbn.some(x=>exactMatch(x,isbn))||!d.title)return null;
  return {isbn,title:d.title,authors:authorNames(d.author_name),
    coverUrl:d.cover_i?"https://covers.openlibrary.org/b/id/"+d.cover_i+"-L.jpg?default=false":null,
    year:d.first_publish_year||null,source:"openlibrary"};
}
async function queryOpenLibrarySearch(isbn,fetcher,timeout) {
  const r=await readJSON("https://openlibrary.org/search.json?isbn="+encodeURIComponent(isbn)+"&limit=20&fields=title,author_name,cover_i,isbn,first_publish_year",fetcher,timeout);
  if(!r.ok)return r;
  return {ok:true,book:(r.data?.docs||[]).map(d=>fromSearchDoc(d,isbn)).find(Boolean)||null};
}
async function queryGoogleBooks(isbn,fetcher,timeout) {
  // Google Books has had field-query regressions and quota errors. Never assume 0 results proves nonexistence.
  const url="https://www.googleapis.com/books/v1/volumes?q="+encodeURIComponent("isbn:"+isbn)+"&maxResults=30&projection=full";
  const r=await readJSON(url,fetcher,timeout);
  if(!r.ok)return r;
  const exact=(r.data?.items||[]).find(item=>(item.volumeInfo?.industryIdentifiers||[]).some(x=>exactMatch(x.identifier,isbn)));
  if(!exact?.volumeInfo?.title)return {ok:true,book:null};
  const v=exact.volumeInfo;
  return {ok:true,book:{isbn,title:v.title,authors:authorNames(v.authors),
    coverUrl:coverUrl(v.imageLinks?.large||v.imageLinks?.medium||v.imageLinks?.thumbnail||v.imageLinks?.smallThumbnail),
    publisher:v.publisher||null,year:v.publishedDate||null,description:v.description||null,source:"googlebooks"}};
}
async function queryOpenLibraryBooks(isbn,fetcher,timeout){
  const key="ISBN:"+isbn;
  const url="https://openlibrary.org/api/books?bibkeys="+encodeURIComponent(key)+"&format=json&jscmd=data";
  const r=await readJSON(url,fetcher,timeout);
  if(!r.ok)return r;
  const d=r.data?.[key];
  if(!d?.title)return {ok:true,book:null};
  if(d.identifiers?.isbn_13?.length&&!d.identifiers.isbn_13.some(x=>exactMatch(x,isbn)) &&
     d.identifiers?.isbn_10?.length&&!d.identifiers.isbn_10.some(x=>exactMatch(x,isbn)))return {ok:true,book:null};
  return {ok:true,book:{isbn,title:d.title,authors:authorNames((d.authors||[]).map(a=>a.name)),
    coverUrl:coverUrl(d.cover?.large||d.cover?.medium)||null,
    publisher:d.publishers?.[0]?.name||null,year:d.publish_date||null,source:"openlibrary"}};
}
const cacheKey="mybookshelf-book-catalog-v2";
function cached(isbn){
  try {const c=JSON.parse(localStorage.getItem(cacheKey)||"{}")[isbn];
    return c?.saved&&Date.now()-c.saved<14*86400000&&c.book?.title?c.book:null
  }catch{return null}
}
function remember(isbn,book){
  try{let values=JSON.parse(localStorage.getItem(cacheKey)||"{}");
    values[isbn]={saved:Date.now(),book};const entries=Object.entries(values).sort((a,b)=>b[1].saved-a[1].saved).slice(0,100);
    localStorage.setItem(cacheKey,JSON.stringify(Object.fromEntries(entries)));
  }catch{/* catalog caching is optional */}
}
export async function lookupISBN(raw,{fetcher=fetch,timeout=9000,disableCache=false}={}){
  const isbn=normalizeISBN(raw);
  if(!isValidISBN(isbn))return {status:"invalid_isbn",isbn};
  if(!disableCache&&fetcher===fetch&&typeof localStorage!=="undefined"){
    const book=cached(isbn);if(book)return {status:"found",book,fromCache:true};
  }
  const diagnostics=[];
  const result1=await queryOpenLibrarySearch(isbn,fetcher,timeout);
  diagnostics.push({provider:"openlibrary-search",...result1,book:undefined});
  if(result1.ok&&result1.book){if(!disableCache&&typeof localStorage!=="undefined")remember(isbn,result1.book);return {status:"found",book:result1.book}}
  const result2=await queryGoogleBooks(isbn,fetcher,timeout);
  diagnostics.push({provider:"google-books",...result2,book:undefined});
  if(result2.ok&&result2.book){if(!disableCache&&typeof localStorage!=="undefined")remember(isbn,result2.book);return {status:"found",book:result2.book}}
  // The second Open Library call is made after the first provider responses, not in parallel.
  const result3=await queryOpenLibraryBooks(isbn,fetcher,timeout);
  diagnostics.push({provider:"openlibrary-books",...result3,book:undefined});
  if(result3.ok&&result3.book){if(!disableCache&&typeof localStorage!=="undefined")remember(isbn,result3.book);return {status:"found",book:result3.book}}
  const failed=diagnostics.filter(x=>!x.ok&&x.error!=="not_found");
  if(failed.length)return {status:failed.every(x=>x.error==="rate_limited")?"rate_limited":"partial_unavailable",isbn,
    details:diagnostics.map(x=>({provider:x.provider,ok:x.ok,error:x.error||null,httpStatus:x.httpStatus||null}))};
  return {status:"not_found",isbn};
}
export async function searchBooksByText(text,{fetcher=fetch,timeout=9000}={}){
  const query=String(text||"").trim();
  if(query.length<3)return {status:"invalid_query",results:[]};
  const url="https://openlibrary.org/search.json?q="+encodeURIComponent(query)+"&limit=10&fields=title,author_name,cover_i,isbn,first_publish_year";
  const r=await readJSON(url,fetcher,timeout);
  if(!r.ok)return {status:r.error==="rate_limited"?"rate_limited":"network_error",results:[]};
  const seen=new Set(),out=[];
  for(const d of r.data?.docs||[]){
    const title=typeof d.title==="string"?d.title.trim():"";const author=authorNames(d.author_name);
    const ident=(title+"|"+author.join(",")).toLowerCase();
    if(!title||seen.has(ident))continue;seen.add(ident);
    out.push({title,authors:author,coverUrl:d.cover_i?"https://covers.openlibrary.org/b/id/"+d.cover_i+"-L.jpg?default=false":null,
      year:d.first_publish_year||null,editionISBNs:(d.isbn||[]).filter(isValidISBN).slice(0,8),source:"openlibrary-title"});
  }
  return {status:out.length?"found":"not_found",results:out.slice(0,8)};
}
