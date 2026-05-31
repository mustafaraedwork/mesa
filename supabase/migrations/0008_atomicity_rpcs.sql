-- 0008 — atomicity helper (2026-05-31, SECURITY-FINDINGS H-3).
-- revert_closing_mode() reverts an expired Closing window inside ONE
-- transaction (a plpgsql function body is atomic), eliminating the cross-table
-- race of the previous two-statement JS revert.
--
-- The application (lib/closing.ts `applyLazyRevert`) PREFERS this RPC and falls
-- back to the two-statement revert when this migration has not been applied
-- yet, so it is safe to deploy the code before OR after running this file.
--
-- Safe / additive: only creates a function. No data change. Re-runnable.

CREATE OR REPLACE FUNCTION revert_closing_mode(p_restaurant_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE restaurants
  SET active_mode = 'normal',
      closing_mode_ends_at = NULL,
      closing_mode_discount = NULL
  WHERE id = p_restaurant_id
    AND active_mode = 'closing';

  UPDATE products
  SET is_in_closing_mode = false
  WHERE restaurant_id = p_restaurant_id
    AND is_in_closing_mode = true;
END;
$$;
