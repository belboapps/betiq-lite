# Cloud backup for BetIQ Lite (optional)

This keeps your bet log safe if you clear your browser or change phone, and shares it between devices.
Only you can see it: you sign in with an email link, and the database only returns rows that belong to you.

## One-off setup (about 10 minutes)

1. Create a free account and a **New project** at supabase.com. Pick any name and region, and save the database password somewhere safe (you will not need it again here).
2. In the project open **SQL Editor > New query**, paste the whole of `supabase/setup.sql` from this repository, and press **Run**. It creates one table, locks it down so each person sees only their own rows, and can be run again safely.
3. Open **Authentication > URL Configuration**. Set **Site URL** to `https://belboapps.github.io/betiq-lite/` and add the same address under **Redirect URLs**. Without this the sign-in link will not bring you back to the app.
4. Open **Project Settings > API**. Copy the **Project URL** and the **anon public** key.
   The anon key is designed to be public. **Never** paste the `service_role` key anywhere.
5. In the app go to **More > Cloud backup**, paste the URL, the anon key and your email, and press **Send me a sign-in link**.
6. Open the email **on the same phone**, tap the link, and you land back in the app signed in. Press **Sync now** to check it works.

## What is and is not synced

- Synced: your real bets and your practice bets, including results, and deletions.
- Not synced: your Odds API key, any other keys, and your settings. Each device keeps its own.
- If the same bet was changed on two devices, the most recent change wins.

## Notes

- Supabase's built-in email sender is limited to a few emails an hour, which is plenty for sign-in.
- Free Supabase projects can be paused after a period of inactivity. Check their current rules. Your bets are also still kept on your phone, so nothing is lost if the project pauses.
- To stop syncing, press **Sign out** in the app. To delete everything in the cloud, delete the project in Supabase.
