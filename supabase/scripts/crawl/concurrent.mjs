export async function mapFour(items,visit) {
 let cursor=0;
 const results=Array(items.length);
 async function worker(){while(cursor<items.length){const index=cursor++;results[index]=await visit(items[index],index);}}
 const settled=await Promise.allSettled(Array.from({length:Math.min(4,items.length)},()=>worker()));
 const failed=settled.find(s=>s.status==='rejected');if(failed)throw failed.reason;
 return results;
}
