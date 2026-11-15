import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});const net=[];page.on('response',res=>{if(/openlibrary|googleapis/.test(res.url()))net.push({url:res.url(),status:res.status()})});page.on('requestfailed',req=>{if(/openlibrary|googleapis/.test(req.url()))net.push({url:req.url(),error:req.failure()?.errorText})});
try{
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.locator('#quickAdd').click();
 await page.locator('#fieldISBN').fill('9780593625484');
 await page.locator('#lookupButton').click();
 await page.waitForFunction(()=>document.querySelector('#lookupButton')?.disabled===false,{timeout:30000});
 const detail=await page.evaluate(async()=>{const m=await import('./catalog.mjs');return await m.lookupISBN('9780593625484')});console.log('REAL CATALOG DIAGNOSTICS',JSON.stringify(detail));console.log('NETWORK CALLS',JSON.stringify(net));
 const status=await page.locator('#lookupStatus').textContent();
 const title=await page.locator('#fieldTitle').inputValue();
 console.log(JSON.stringify({status,title}));
 if(!title)throw Error('Real catalog lookup did not return the book title. '+status);
 console.log('LIVE LOOKUP TEST PASSED');
}catch(e){console.error('LIVE LOOKUP TEST FAILED:',e);process.exitCode=1}
finally{await browser.close()}
