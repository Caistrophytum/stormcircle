-- Ensure full row data is sent on UPDATE/DELETE events (needed so DELETE
-- payloads include the row id the client uses to remove the message).
ALTER TABLE public.messages REPLICA IDENTITY FULL;

-- Add the messages table to the supabase_realtime publication.
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;