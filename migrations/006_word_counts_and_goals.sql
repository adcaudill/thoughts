-- Add unencrypted word count to notes and optional goal to folders
ALTER TABLE notes ADD COLUMN word_count INTEGER DEFAULT 0;
ALTER TABLE folders ADD COLUMN goal_word_count INTEGER;
