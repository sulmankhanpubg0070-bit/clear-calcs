CREATE TABLE public.family_summary_ai_state (
  id integer PRIMARY KEY DEFAULT 1,
  blocked_status integer NOT NULL,
  message text NOT NULL
);
GRANT ALL ON public.family_summary_ai_state TO service_role;
ALTER TABLE public.family_summary_ai_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service manages AI pause" ON public.family_summary_ai_state FOR ALL TO service_role USING (true) WITH CHECK (true);