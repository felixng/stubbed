# Country boundaries

`Countries.geojson` contains Natural Earth 1:110m admin-0 country geometry,
with only the canonical country code retained as a property.

Source: https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson
Terms: https://www.naturalearthdata.com/about/terms-of-use/ (public domain).

This coarse world overview omits some small countries. Every recorded country
still appears in the accessible country list and can open its visits; no live
geocoder or paid map service is used. Country names/codes are normalised in
Postgres by `insight_country`, not inferred from coordinates on the phone.
