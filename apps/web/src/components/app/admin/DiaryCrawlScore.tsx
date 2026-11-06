import { ownerContext } from "@/lib/supabase/data";
type Row={venue_id:string;venue_name:string;entry_id:string;title:string;on_date:string;outcome:string};
export async function DiaryCrawlScore({venueIds}:{venueIds:string[]}) {
  if(!venueIds.length) return null;
  const {supabase}=await ownerContext();
  const {data,error}=await supabase.rpc("admin_diary_crawl_score",{venue_ids:venueIds});
  if(error) return <p className="text-label-secondary">Couldn’t load diary score.</p>;
  const rows=(data??[]) as Row[];
  const venues=[...new Set(rows.map(r=>r.venue_id))];
  const score=(list:Row[])=>`${list.filter(r=>r.outcome==='matching_dates').length} matching dates · ${list.filter(r=>r.outcome==='wrong_dates').length} wrong dates · ${list.filter(r=>r.outcome==='missed').length} missed`;
  return <section className="flex flex-col gap-3 rounded-md border border-separator bg-surface p-4">
    <h2 className="text-headline">Against your diary</h2><p className="text-footnote text-label-secondary">Only your own logged visits are compared. {rows.length ? score(rows) : "No logged visits at these theatres."}</p>
    {venues.map(id=>{const list=rows.filter(r=>r.venue_id===id);return <div key={id}><h3 className="text-headline">{list[0].venue_name}</h3><p className="text-footnote">{score(list)}</p><ul>{list.filter(r=>r.outcome!=='matching_dates').map(r=><li key={r.entry_id} className="py-1 text-subheadline">{r.title} · {r.on_date} · {r.outcome==='missed'?'Missed':'Wrong dates'}</li>)}</ul></div>;})}
  </section>;
}
