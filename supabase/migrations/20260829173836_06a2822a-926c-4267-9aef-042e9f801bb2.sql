ALTER TABLE public.messages
  ADD CONSTRAINT messages_content_length_chk
  CHECK (char_length(content) <= CASE WHEN badge = 'System' THEN 8000 ELSE 500 END);