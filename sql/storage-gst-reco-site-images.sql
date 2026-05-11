-- Public bucket gst-reco-site-images on project qfeuxyuyxjkmqjpiknes (Dahotre Group Websites).

insert into storage.buckets (id, name, public, file_size_limit)
values ('gst-reco-site-images', 'gst-reco-site-images', true, 104857600)
on conflict (id) do nothing;

drop policy if exists "Public read gst-reco-site-images" on storage.objects;
create policy "Public read gst-reco-site-images"
on storage.objects for select
to public
using (bucket_id = 'gst-reco-site-images');

drop policy if exists "Anon insert gst-reco-site-images" on storage.objects;
create policy "Anon insert gst-reco-site-images"
on storage.objects for insert
to anon
with check (bucket_id = 'gst-reco-site-images');

drop policy if exists "Anon update gst-reco-site-images" on storage.objects;
create policy "Anon update gst-reco-site-images"
on storage.objects for update
to anon
using (bucket_id = 'gst-reco-site-images')
with check (bucket_id = 'gst-reco-site-images');

drop policy if exists "Anon delete gst-reco-site-images" on storage.objects;
create policy "Anon delete gst-reco-site-images"
on storage.objects for delete
to anon
using (bucket_id = 'gst-reco-site-images');
