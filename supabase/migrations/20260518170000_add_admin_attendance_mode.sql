-- Add 'admin' option to attendance_mode check constraint
ALTER TABLE parishes DROP CONSTRAINT IF EXISTS parishes_attendance_mode_check;
ALTER TABLE parishes ADD CONSTRAINT parishes_attendance_mode_check
  CHECK (attendance_mode IN ('button', 'qr', 'gps', 'admin'));
