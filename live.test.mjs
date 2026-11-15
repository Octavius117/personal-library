import { chromium } from 'playwright';
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844}});
try{
 await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
 await page.locator('#quickAdd').click();
 await page.locator('#fieldISBN').fill('9780593625484');
 await page.locator('#lookupButton').click();
 await page.waitForFunction(()=>document.querySelector('#lookupButton')?.disabled===false,{timeout:30000});
 const status=await page.locator('#lookupStatus').textContent();
 const title=await page.locator('#fieldTitle').inputValue();
 console.log(JSON.stringify({status,title}));
 if(!title)throw Error('Real catalog lookup did not return the book title. '+status);
 console.log('LIVE LOOKUP TEST PASSED');
}catch(e){console.error('LIVE LOOKUP TEST FAILED:',e);process.exitCode=1}
finally{await browser.close()}
