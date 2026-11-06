"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {Button} from "@/components/ui/Button";
import {createClient} from "@/lib/supabase/client";
export function CrawlRuleAction({id,status}:{id:string;status:string}){
 const [busy,setBusy]=useState(false),[error,setError]=useState("");const router=useRouter();
 async function act(){setBusy(true);const {error}=await createClient().rpc("admin_crawl_rule_action",{rule_id:id,action:status==='retired'?'restore':'retire'});setBusy(false);setError(error?.message??'');if(!error)router.refresh();}
 return <div><Button variant="secondary" size="sm" disabled={busy} onClick={act}>{status==='retired'?'Propose restoration':'Retire version'}</Button>{error&&<p role="alert">{error}</p>}</div>;
}
export function RetryCrawlSite({id}:{id:string}){
 const [busy,setBusy]=useState(false),[message,setMessage]=useState("");const router=useRouter();
 async function retry(){setBusy(true);const {error}=await createClient().rpc("admin_retry_crawl_site",{for_site:id});setBusy(false);setMessage(error?.message??'Queued for the next loop.');if(!error)router.refresh();}
 return <div><Button variant="secondary" disabled={busy} onClick={retry}>Try site again</Button><p role="status">{message}</p></div>;
}
