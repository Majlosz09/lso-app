-- Fix notify_push: pass body as jsonb (not text) to match pg_net's current API,
-- and wrap the HTTP call in an exception block so push failures never abort the
-- parent transaction (e.g. check_in_and_award_points).
CREATE OR REPLACE FUNCTION notify_push(
  tokens text[],
  title  text,
  body   text,
  data   jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  messages jsonb := '[]'::jsonb;
  token    text;
BEGIN
  IF tokens IS NULL OR array_length(tokens, 1) IS NULL THEN RETURN; END IF;

  FOREACH token IN ARRAY tokens LOOP
    IF token IS NOT NULL AND length(token) > 0 THEN
      messages := messages || jsonb_build_array(jsonb_build_object(
        'to',    token,
        'title', title,
        'body',  body,
        'data',  data,
        'sound', 'default'
      ));
    END IF;
  END LOOP;

  IF jsonb_array_length(messages) = 0 THEN RETURN; END IF;

  BEGIN
    PERFORM net.http_post(
      url     := 'https://kvqjaoprxxiemynyihfs.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cWphb3ByeHhpZW15bnlpaGZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwNDQ3ODAsImV4cCI6MjA5MzYyMDc4MH0.55gjfeRl-xBsw_fdinSlxfPiao3BFwVNlo_cCVAQvzY'
      ),
      body    := jsonb_build_object('messages', messages)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- push notification failure must never abort attendance/points writes
  END;
END;
$$;
