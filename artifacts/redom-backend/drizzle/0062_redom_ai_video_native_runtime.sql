ALTER TABLE redom_ai_videos RENAME COLUMN provider TO runtime;
ALTER TABLE redom_ai_videos ALTER COLUMN runtime SET DEFAULT 'redom-v2.8-native';
UPDATE redom_ai_videos SET runtime = 'redom-v2.8-native' WHERE runtime IN ('seedance', 'veo', 'gemini');
