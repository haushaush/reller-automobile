CREATE UNIQUE INDEX IF NOT EXISTS mobile_reconciliation_issues_open_uniq
  ON public.mobile_reconciliation_issues (issue_type, scope, mobile_ad_id)
  WHERE resolved_at IS NULL;