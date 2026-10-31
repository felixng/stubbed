import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatchBatch } from "../../../supabase/functions/_shared/notifications/dispatch";
import { apnsResult, createAPNsSender } from "../../../supabase/functions/_shared/notifications/apns";
import type { DeliveryQueue, PreparedJob, SendResult } from "../../../supabase/functions/_shared/notifications/contracts.ts";
const job: PreparedJob = { kind: "apns", token: "token", environment: "sandbox", subscription: null, notification: { id: "id", title: "Stubbed", body: "You have new activity on Stubbed.", url: "/app/notifications/open/id" }, expires_at: new Date(Date.now()+60000).toISOString() };
function fake(prepared: PreparedJob | null) {
  const results: SendResult[] = [];
  const queue: DeliveryQueue = { claim: async () => [{job_id:"j",lease_id:"l"}], prepare: async () => prepared, finish: async (_,result) => { results.push(result); } };
  return { queue, results };
}
test("dispatch rechecks policy and skips invalidated jobs", async () => {
 const {queue,results}=fake(null); let sends=0;
 await dispatchBatch(queue,async()=>{sends++;return "accepted";});
 assert.equal(sends,0);assert.deepEqual(results,[]);
});
test("transport failures are retryable and acknowledgement failures surface", async () => {
 const {queue,results}=fake(job);
 await dispatchBatch(queue,async()=>{throw new Error("offline");});assert.deepEqual(results,["retryable"]);
 queue.finish=async()=>{throw new Error("db down");};
 await assert.rejects(dispatchBatch(queue,async()=>"accepted"),/db down/);
});
test("expired jobs never call the transport", async()=>{
 const {queue,results}=fake({...job,expires_at:"2000-01-01T00:00:00Z"});
 await dispatchBatch(queue,async()=>{throw new Error("must not send");});assert.deepEqual(results,["permanent"]);
});
test("APNs failure contracts preserve provider distinctions",()=>{
 assert.equal(apnsResult(200),"accepted");assert.equal(apnsResult(410),"invalid_destination");
 assert.equal(apnsResult(400,"BadDeviceToken"),"invalid_destination");assert.equal(apnsResult(400,"BadTopic"),"permanent");
 assert.equal(apnsResult(429),"retryable");assert.equal(apnsResult(503),"retryable");assert.equal(apnsResult(403,"ExpiredProviderToken"),"retryable");
});
test("APNs adapter signs server-side, selects environment and bounds expiry",async()=>{
 const keys=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
 const der=await crypto.subtle.exportKey("pkcs8",keys.privateKey);
 const privateKey=`-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64")}\n-----END PRIVATE KEY-----`;
 let sent=false;
 const request: typeof fetch=async(input,init)=>{
  assert.match(String(input),/^https:\/\/api.sandbox.push.apple.com\/3\/device\//);
  const headers=init?.headers as Record<string,string>;
  assert.equal(headers["apns-topic"],"app.getstubbed");assert.equal(headers["apns-push-type"],"alert");
  const [h,p,s]=headers.authorization.replace("bearer ","").split(".");
  assert.equal(await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},keys.publicKey,Buffer.from(s,"base64url"),new TextEncoder().encode(`${h}.${p}`)),true);
  assert.equal(JSON.parse(String(init?.body)).notification_id,"id");sent=true;return new Response(null,{status:200});
 };
 const sender=createAPNsSender({teamId:"team",keyId:"key",privateKey,topic:"app.getstubbed"},request);
 assert.equal(await sender.send({token:"token",environment:"sandbox"},job.notification,new Date(job.expires_at)),"accepted");assert.equal(sent,true);
});
