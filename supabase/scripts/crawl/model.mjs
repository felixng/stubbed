import { MODEL_PRICES, costUsd } from './sources/theatre-site.mjs';
// Page content is an untrusted payload, never system instructions or tools.
// Reserve the maximum possible token bill before a request, not after it.
// Server web search is billed per search on top of tokens.
export const WEB_SEARCH_USD = 0.01;

export function requestCostUsd(model, usage) {
 return costUsd(model, usage) + (usage?.server_tool_use?.web_search_requests ?? 0) * WEB_SEARCH_USD;
}

// The JSON object in the last text block (web search answers arrive after the searches, with no
// structured output). Returns undefined when there is none.
export function lastJson(content) {
 const texts = (content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '');
 for (let i = texts.length - 1; i >= 0; i--) {
  const joined = texts.slice(i).join('');
  const match = joined.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
 }
 return undefined;
}

export function createModel({ apiKey=process.env.ANTHROPIC_API_KEY,fetchFn=fetch,spend={usd:0},budgetUsd=0,siteBudgetUsd=0.20, reserveSpend, settleSpend, stopSignal }={}) {
 const siteSpend=new Map();
 return async function model({siteId,model='claude-haiku-5-5',system,payload,schema,beforeRequest,tools,thinking,effort,maxTokens=3000,extraReserveUsd=0,parse='first_text'}) {
  if(stopSignal?.aborted) return {deferred:true,reason:'time_limit'};
  if(!apiKey) return {deferred:true,reason:'model_unavailable'};
  const prices=MODEL_PRICES[model];if(!prices) return {deferred:true,reason:'unknown_model'};
  const input=JSON.stringify(payload);
  if(input.length>50000)return {deferred:true,reason:'input_limit'};
  const max_tokens=maxTokens;
  // UTF-8 byte count is a conservative upper bound on input tokens.
  const reserve=((Buffer.byteLength(input+system+' '+JSON.stringify(schema??null))+2048)*prices[0]+max_tokens*prices[1])/1e6+Math.max(0,extraReserveUsd);
  if(spend.usd+reserve>budgetUsd || (siteSpend.get(siteId)??0)+reserve>siteBudgetUsd) return {deferred:true,reason:'budget_limit'};
  spend.usd+=reserve;siteSpend.set(siteId,(siteSpend.get(siteId)??0)+reserve);
  let reservation;
  try {
   if(reserveSpend) reservation=await reserveSpend(siteId,reserve,siteBudgetUsd);
   const permitted=(!reserveSpend || reservation) && (!beforeRequest || await beforeRequest());
   if(!permitted || stopSignal?.aborted) {
    if(reservation) await settleSpend(reservation,0);
    spend.usd-=reserve;siteSpend.set(siteId,siteSpend.get(siteId)-reserve);
    return {deferred:true,reason:stopSignal?.aborted?'time_limit':reserveSpend&&!reservation?'budget_limit':'repair_limit'};
   }
   const timeout=AbortSignal.timeout(60000);
   const output_config={...(schema?{format:{type:'json_schema',schema}}:{}),...(effort?{effort}:{})};
   const body={model,max_tokens,system,...(Object.keys(output_config).length?{output_config}:{}),...(thinking?{thinking}:{}),...(tools?{tools}:{}),messages:[{role:'user',content:input}]};
   const response=await fetchFn('https://api.anthropic.com/v1/messages',{method:'POST',signal:stopSignal?AbortSignal.any([stopSignal,timeout]):timeout,headers:{'content-type':'application/json','x-api-key':apiKey,'anthropic-version':'2026-10-21'},body:JSON.stringify(body)});
   if(!response.ok) {
    // The API's own error type and message help diagnose a refused request; they never hold the key.
    let detail=`http_${response.status}`;
    try{const error=(await response.json())?.error;if(error?.type)detail+=`:${error.type}:${String(error.message??'').slice(0,200)}`;}catch{}
    return {deferred:true,reason:'model_unavailable',detail};
   }
   const data=await response.json();const actual=requestCostUsd(model,data.usage);
   if(data.usage && reservation) await settleSpend(reservation,actual);
   if(data.usage) {spend.usd+=actual-reserve;siteSpend.set(siteId,(siteSpend.get(siteId)??0)+actual-reserve);}
   if(data.stop_reason==='refusal') return {invalid:true,reason:'refusal',usage:data.usage};
   if(parse==='last_json'){const value=lastJson(data.content);return value===undefined?{invalid:true,reason:'invalid_json',usage:data.usage}:{value,usage:data.usage};}
   const block=data.content?.find(b=>b.type==='text');
   try{return {value:JSON.parse(block?.text??''),usage:data.usage};}catch{return {invalid:true,reason:'invalid_json',usage:data.usage};}
  }catch{return {deferred:true,reason:'model_unavailable'};}
 };
}
