-- Citizen permits and licenses are now issued immediately. Convert any
-- applications that were waiting in the former police approval queue.
UPDATE mdt_licenses
SET status='valid',
    issued_at=COALESCE(issued_at, updated_at),
    updated_by='Licensing office'
WHERE status='pending';
