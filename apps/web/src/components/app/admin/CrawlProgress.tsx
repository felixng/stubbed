import {ownerContext} from "@/lib/supabase/data";
export async function CrawlProgress(){
 const {supabase}=await ownerContext();const {data,error}=await supabase.rpc("admin_crawl_progress");
 if(error)return <p>Couldn’t load crawl progress.</p>;
 const p=data as Record<string,number>;
 return <section className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4"><h2 className="text-title-2 font-display">Crawl progress</h2><dl className="grid grid-cols-2 gap-3">{[['theatres','Theatres'],['website','Website found'],['link','What’s-on link'],['rules','Active rules'],['history_done','History complete'],['needs_attention','Needs attention'],['runs','Runs filled'],['spend_usd','Total spend (USD)']].map(([key,label])=><div key={key}><dt className="text-footnote text-label-secondary">{label}</dt><dd className="text-headline">{key==='spend_usd'?`$${Number(p[key]).toFixed(4)}`:p[key]}</dd></div>)}</dl><p className="text-footnote text-label-secondary">Scheduled work starts only when the repository switch CRAWL_LOOP_ENABLED is true. Sites needing attention keep their existing data.</p></section>;
}
