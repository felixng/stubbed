begin;
select no_plan();
insert into public.venues(name, city, country) values
 ('Inference theatre A', 'Inference Unique City', 'GB'),
 ('Inference theatre B', 'Inference Ambiguous City', 'GB'),
 ('Inference theatre C', 'Inference Ambiguous City', 'US'),
 ('Inference Shared Theatre', 'Inference Ambiguous City', 'GB'),
 ('Inference Shared Theatre', 'Inference Ambiguous City', 'US'),
 ('Inference NYC Theatre', 'New York', 'US');
set local role authenticated;
select is(public.infer_import_country('Unknown theatre', 'Inference Unique City'), 'GB', 'city alone identifies country');
select is(public.infer_import_country('Inference theatre B', 'Inference Ambiguous City'), 'GB', 'exact venue disambiguates city');
select is(public.infer_import_country('Unknown theatre', 'Inference Ambiguous City'), null, 'ambiguous city requires choice');
select is(public.infer_import_country('Inference Shared Theatre', 'Inference Ambiguous City'), null, 'ambiguous venue requires choice');
select is(public.infer_import_country('Unknown theatre', 'Nowhere In Catalogue 93845'), null, 'unknown city requires choice');
select is(public.infer_import_country('Unknown theatre', ''), null, 'empty city is never guessed');
select is(public.infer_import_country('Unknown theatre', ' New York City '), 'US', 'existing city alias works without a venue match');
select * from finish();
rollback;
