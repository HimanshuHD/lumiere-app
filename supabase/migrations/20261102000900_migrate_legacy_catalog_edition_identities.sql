-- The edition-aware importer must also find records quarantined by #9.
-- Keep their IDs, visibility, ownership and all personal references unchanged.
-- Unknown formats/URLs remain quarantined for privileged review.
UPDATE public.documents AS document
SET source_identity = document.source_identity
  || ':' || lower(document.file_format)
  || ':' || lower(regexp_replace(
    regexp_replace(document.source_url, '^https?://[^/]+', '', 'i'),
    '[?#].*$', ''
  ))
WHERE document.origin = 'legacy_unowned'
  AND document.source_identity ~ '^project-gutenberg:[0-9]+$'
  AND lower(document.file_format) IN ('epub', 'pdf')
  AND document.source_url ~* '^https://(www\.|m\.|aleph\.)?gutenberg\.org/';
