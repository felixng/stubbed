import assert from "node:assert/strict";
import { test } from "node:test";
import { mobilePushEligibility, requestMobilePermission, effectivePushPermission, pushKeyMatches, type PushContext } from "../src/lib/mobile-push";
import { supportedPushEndpoint, browserPushResult, createBrowserPushSender } from "../../../supabase/functions/_shared/notifications/browser-push";
const base: PushContext = { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5, standalone: true, secure: true, serviceWorker: true, pushManager: true, notifications: true };
test("mobile/tablet eligibility excludes desktop even when push capable",()=>{
 assert.equal(mobilePushEligibility(base),"ios_home_screen");
 assert.equal(mobilePushEligibility({...base,standalone:false}),"install_ios");
 assert.equal(mobilePushEligibility({...base,userAgent:"Macintosh",platform:"MacIntel"}),"ios_home_screen");
 assert.equal(mobilePushEligibility({...base,userAgent:"Android",platform:"Linux",standalone:false}),"android");
 assert.equal(mobilePushEligibility({...base,userAgent:"Macintosh",platform:"MacIntel",maxTouchPoints:0}),"desktop");
 assert.equal(mobilePushEligibility({...base,userAgent:"Windows NT",platform:"Win32",maxTouchPoints:10}),"desktop");
 assert.equal(mobilePushEligibility({...base,pushManager:false}),"unsupported");
});
test("denied/revoked permission and desktop never prompt",async()=>{
 let prompts=0;const request=async()=>{prompts++;return "denied" as const;};
 assert.equal(await requestMobilePermission("ios_home_screen","default",request),"denied");
 await requestMobilePermission("ios_home_screen","denied",request);
 await requestMobilePermission("android","denied",request);
 await requestMobilePermission("desktop","default",request);
 await requestMobilePermission("install_ios","default",request);
 assert.equal(prompts,1);
});
test("endpoint validation rejects SSRF and credential-bearing URLs",()=>{
 assert.equal(supportedPushEndpoint("https://fcm.googleapis.com/fcm/send/test"),true);
 for(const url of ["http://fcm.googleapis.com/x","https://127.0.0.1/x","https://fcm.googleapis.com.evil.test/x","https://user@fcm.googleapis.com/x","https://fcm.googleapis.com:444/x","https://web.push.apple.com/x#fragment"]) assert.equal(supportedPushEndpoint(url),false,url);
 assert.equal(browserPushResult(201),"accepted");assert.equal(browserPushResult(410),"invalid_destination");assert.equal(browserPushResult(429),"retryable");assert.equal(browserPushResult(400),"permanent");
});
test("browser adapter bounds TTL, disallows redirects and distinguishes encoding/network failures",async()=>{
 const sub={endpoint:"https://web.push.apple.com/test",keys:{p256dh:"key",auth:"auth"}};
 const alert={id:"id",title:"Stubbed",body:"generic",url:"/app/notifications"};
 const expires=new Date(Date.now()+60000);
 const sender=createBrowserPushSender((s,_,ttl)=>{assert.ok(ttl>0&&ttl<=60);return{endpoint:s.endpoint,headers:{TTL:String(ttl)},body:new Uint8Array([1])};},async(_,init)=>{assert.equal(init?.redirect,"error");return new Response(null,{status:410});});
 assert.equal(await sender.send(sub,alert,expires),"invalid_destination");
 assert.equal(await createBrowserPushSender(()=>{throw new Error("bad key");}).send(sub,alert,expires),"permanent");
 assert.equal(await createBrowserPushSender(s=>({endpoint:s.endpoint,headers:{},body:new Uint8Array()}),async()=>{throw new Error("offline");}).send(sub,alert,expires),"retryable");
});

test("remembered refusal survives default permission reset; changed VAPID keys require renewal",()=>{
 assert.equal(effectivePushPermission("default",true),"denied");
 assert.equal(effectivePushPermission("granted",true),"granted");
 assert.equal(pushKeyMatches(new Uint8Array([1,2]),new Uint8Array([1,2]).buffer),true);
 assert.equal(pushKeyMatches(new Uint8Array([1,3]),new Uint8Array([1,2]).buffer),false);
 assert.equal(pushKeyMatches(new Uint8Array([1,2]),null),false);
});
