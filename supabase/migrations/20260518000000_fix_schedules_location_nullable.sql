-- Make location nullable so generate_schedules_from_templates RPC works
-- without requiring a location on auto-generated schedules
ALTER TABLE schedules ALTER COLUMN location DROP NOT NULL;
