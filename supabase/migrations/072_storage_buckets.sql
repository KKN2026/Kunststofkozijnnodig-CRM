-- Buckets die de app naast 'email-bijlagen' (migratie 040) nodig heeft.
-- 'documenten': leveranciers-PDF's en kozijntekening-images van de offerte-wizard.
-- 'db-backups': nachtelijke database-dumps (api/admin/backup-db maakt hem anders zelf aan).
-- Private buckets — alle toegang loopt server-side via de service role / signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('documenten', 'documenten', false),
  ('db-backups', 'db-backups', false)
ON CONFLICT (id) DO NOTHING;
