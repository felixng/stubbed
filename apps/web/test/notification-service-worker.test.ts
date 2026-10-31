import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
const code=readFileSync(new URL("../public/notifications-sw.js",import.meta.url),"utf8");
function harness(owner: string|null="account-a",session="account-a") {
 let stored: unknown=owner?{owner,installation:"i",secret:"s",endpoint:"https://web.push.apple.com/old",supabaseUrl:"https://example.supabase.co",publicKey:"public"}:null;
 const handlers: Record<string,(event: unknown)=>void>={};
 const displayed: {title:string;options:Record<string,unknown>}[]=[];
 const opened: string[]=[];
 const requests: {url:string;body?:string}[]=[];
 const indexedDB={open:()=>{
  const open: Record<string,unknown>={};
  queueMicrotask(()=>{
   open.result={close:()=>{},transaction:()=>{
    const tx: Record<string,unknown>={};
    const operation=(value:unknown,write:boolean)=>{
     const op: Record<string,unknown>={};
     queueMicrotask(()=>{if(write)stored=value;op.result=stored;(op.onsuccess as (()=>void)|undefined)?.();queueMicrotask(()=>(tx.oncomplete as (()=>void)|undefined)?.());});
     return op;
    };
    tx.objectStore=()=>({get:()=>operation(null,false),put:(v:unknown)=>operation(v,true),delete:()=>operation(null,true)});
    return tx;
   }};
   (open.onsuccess as (()=>void)|undefined)?.();
  });return open;
 }};
 vm.runInNewContext(code,{indexedDB,URL,AbortSignal,fetch:async(url:string,init?:{body?:string})=>{requests.push({url,body:init?.body});return{ok:true,json:async()=>({user_id:session})};},self:{location:{origin:"https://getstubbed.app"},addEventListener:(name:string,fn:(event:unknown)=>void)=>{handlers[name]=fn;},registration:{showNotification:async(title:string,options:Record<string,unknown>)=>{displayed.push({title,options});},getNotifications:async()=>[]},clients:{matchAll:async()=>[],openWindow:async(url:string)=>{opened.push(url);}}}});
 async function fire(name:string,event:Record<string,unknown>) {let pending:Promise<unknown>|undefined;handlers[name]({...event,waitUntil:(p:Promise<unknown>)=>{pending=p;}});await pending;}
 return{fire,displayed,opened,requests};
}
test("received push displays once with verified-account preview",async()=>{
 const h=harness();await h.fire("push",{data:{json:()=>({id:"id",recipient_id:"account-a",body:"Alex liked your show",url:"/app/notifications"})}});
 assert.equal(h.displayed.length,1);assert.equal(h.displayed[0].options.body,"Alex liked your show");
});
test("logout or account switching downgrades private preview",async()=>{
 for(const h of [harness(null),harness("account-a","account-b")]){
  await h.fire("push",{data:{json:()=>({recipient_id:"account-a",body:"private preview",url:"https://evil.example"})}});
  assert.equal(h.displayed[0].options.body,"Open Stubbed to see your activity.");
 }
});
test("clicks cannot navigate off origin, including malformed payloads",async()=>{
 const h=harness();await h.fire("notificationclick",{notification:{close:()=>{},data:{owner:"account-a",url:"https://evil.example"}}});
 assert.deepEqual(h.opened,["https://getstubbed.app/app/notifications"]);
});
test("subscription expiry cleans only the expired endpoint without resubscribing",async()=>{
 const h=harness();await h.fire("pushsubscriptionchange",{oldSubscription:{endpoint:"https://web.push.apple.com/old"}});
 assert.equal(h.requests.length,1);assert.match(h.requests[0].url,/remove_browser_push$/);
 assert.equal(JSON.parse(h.requests[0].body!).endpoint,"https://web.push.apple.com/old");
});

test("signed-out clicks preserve the opaque resolver through sign-in",async()=>{
 const h=harness(null,"account-b");
 const path="/app/notifications/open/00000000-0000-4000-8000-000000000001";
 await h.fire("notificationclick",{notification:{close:()=>{},data:{url:path}}});
 assert.deepEqual(h.opened,[`https://getstubbed.app${path}`]);
});
