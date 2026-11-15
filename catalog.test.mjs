import assert from "node:assert/strict";
import {normalizeISBN,isValidISBN,isbn10To13,lookupISBN} from "./catalog.mjs";
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
