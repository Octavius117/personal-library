import assert from "node:assert/strict";
import {normalizeISBN,isValidISBN,isbn10To13,lookupISBN,searchBooksByText} from "./catalog.mjs";
assert.equal(normalizeISBN("978-0-593-62548-4"),"9780593625484");
assert.equal(normalizeISBN("978059362548451999"),"9780593625484");
assert.equal(isValidISBN("9780593625484"),true);
assert.equal(isValidISBN("9780593625485"),false);
assert.equal(isValidISBN("0306406152"),true);
assert.equal(isbn10To13("0306406152"),"9780306406157");
const mock=async url=>{
 if(url.includes("googleapis.com"))return {ok:true,json:async()=>({items:[{volumeInfo:{title:"Test Catalog Entry",authors:["Example Author"],industryIdentifiers:[{type:"ISBN_13",identifier:"9780593625484"}]}}]})};
 return {ok:false,status:404};
};
const r=await lookupISBN("9780593625484",{fetcher:mock,timeout:500});
assert.equal(r.status,"found");assert.equal(r.book.title,"Test Catalog Entry");
const no=await lookupISBN("9780593625484",{fetcher:async()=>({ok:false,status:404})});
assert.equal(no.status,"not_found");
const blocked=await lookupISBN("9780593625484",{fetcher:async()=>{throw Error("CORS blocked")}});
assert.equal(blocked.status,"network_error");
console.log("Catalog unit tests passed");

const limited=await lookupISBN("9780593625484",{fetcher:async()=>({ok:false,status:429}),disableCache:true});
assert.equal(limited.status,"rate_limited");
const partial=await lookupISBN("9780593625484",{fetcher:async u=>({ok:false,status:u.includes("googleapis")?429:404}),disableCache:true});
assert.equal(partial.status,"partial_unavailable");
const wrong=await lookupISBN("9780593625484",{fetcher:async u=>({ok:true,json:async()=>u.includes("googleapis")?({items:[{volumeInfo:{title:"Wrong Edition",industryIdentifiers:[{identifier:"9780306406157"}]}}]}):u.includes("api/books")?{}:{docs:[]}}),disableCache:true});
assert.equal(wrong.status,"not_found");
const title=await searchBooksByText("The Hobbit",{fetcher:async()=>({ok:true,json:async()=>({docs:[{title:"The Hobbit",author_name:["J. R. R. Tolkien"],cover_i:123,isbn:["9780547928227"]}]})})});
assert.equal(title.status,"found");assert.equal(title.results[0].title,"The Hobbit");
