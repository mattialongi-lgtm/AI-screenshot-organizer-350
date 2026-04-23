-- Ensure screenshot files are not publicly readable.
update storage.buckets
set public = false
where id = 'screenshots';
