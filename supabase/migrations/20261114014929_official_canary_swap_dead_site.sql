-- Swap a dead canary (#544, epic #536). brasseriezedel.com's saved what's-on URL answers 404 (also in a browser and
-- for the legacy engine's last read, on 7 Nov), so it cannot show whether the new engine works. It goes back to the
-- legacy lane, which repairs a moved link, and its frontier generation is retired (tasks kept, no longer claimed).
-- The next site by the same ranking takes its place: menierchocolatefactory.com (200, ready, one logged entry).
update public.crawl_sites set engine = 'legacy' where id = '11c25798-8641-4139-8fa9-a759734e268c';
update public.crawl_generations set is_current = false
where site_id = '11c25798-8641-4139-8fa9-a759734e268c' and is_current;
update public.crawl_sites set engine = 'frontier'
where id = 'b433ad1a-bb30-430e-abbe-202cbe3a01db' and status = 'ready' and engine = 'legacy';
