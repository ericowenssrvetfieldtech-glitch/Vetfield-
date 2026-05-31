/*
  # Auto-confirm new user emails on signup

  1. Changes
    - Creates a trigger function that sets `email_confirmed_at` immediately when a new user is inserted
    - This removes the need for email confirmation, allowing users to sign in right after signup

  2. Security
    - Only affects new inserts into auth.users
    - Does not modify existing confirmed users
*/

CREATE OR REPLACE FUNCTION public.auto_confirm_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email_confirmed_at IS NULL THEN
    NEW.email_confirmed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'auto_confirm_user_trigger'
  ) THEN
    CREATE TRIGGER auto_confirm_user_trigger
      BEFORE INSERT ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.auto_confirm_user();
  END IF;
END $$;
