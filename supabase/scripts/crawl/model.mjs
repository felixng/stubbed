import { MODEL_PRICES, costUsd } from './sources/theatre-site.mjs';
// Page content is an untrusted payload, never system instructions or tools.
// Reserve the maximum possible token bill before a request, not after it.
export function createModel({ apiKey=process.env.ANTHROPIC_API_KEY,fetchFn=fetch,spend={usd:0},budgetUsd=0,siteBudgetUsd=0.20 }={}) {
 const siteSpend=new Map();
 return async function model({siteId,model='claude-haiku-5-5',system,payload,schema}) {
  if(!apiKey) return {deferred:true,reason:'model_unavailable'};
  const prices=MODEL_PRICES[model];if(!prices) return {deferred:true,reason:'unknown_model'};
  const input=JSON.stringify(payload);
  if(input.length>50000)return {deferred:true,reason:'input_limit'};
  const max_tokens=3000;
  // UTF-8 byte count is a conservative upper bound on input tokens.
  const reserve=((Buffer.byteLength(input+system+' '+JSON.stringify(schema))+2048)*prices[0]+max_tokens*prices[1])/1e6;
  if(spend.usd+reserve>budgetUsd || (siteSpend.get(siteId)??0)+reserve>siteBudgetUsd) return {deferred:true,reason:'budget_limit'};
  spend.usd+=reserve;siteSpend.set(siteId,(siteSpend.get(siteId)??0)+reserve);
  try {
   const response=await fetchFn('https://api.anthropic.com/v1/messages',{method:'POST',signal:AbortSignal.timeout(60000),headers:{'content-type':'application/json','x-api-key':apiKey,'anthropic-version':'2026-10-21'},body:JSON.stringify({model,max_tokens,system,output_config:{format:{type:'json_schema',schema}},messages:[{role:'user',content:input}]})});
   if(!response.ok) return {deferred:true,reason:'model_unavailable'};
   const data=await response.json();const actual=costUsd(model,data.usage);
   if(data.usage) {spend.usd+=actual-reserve;siteSpend.set(siteId,(siteSpend.get(siteId)??0)+actual-reserve);}
   const block=data.content?.find(b=>b.type==='text');
   try{return {value:JSON.parse(block?.text??'')};}catch{return {invalid:true,reason:'invalid_json'};}
  }catch{return {deferred:true,reason:'model_unavailable'};}
 };
}
